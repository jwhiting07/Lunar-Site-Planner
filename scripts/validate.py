"""Independent validations of the Lunar Site Planner geometry.

Usage:  python scripts/validate.py            (all checks; network needed for V-1 unless cached)
        python scripts/validate.py --no-tests (skip running vitest/pytest for V-8)

Writes docs/validation_results.json and docs/VALIDATION.md (generated from the JSON).
Raw JPL Horizons responses are cached in data_cache/horizons/ and reused.
To run vitest for V-8, `npx` must be on PATH (or set VALIDATE_NODE_DIR to the Node directory).

Every number in the outputs is computed by this script at run time.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moonlib as ml  # noqa: E402
import vcommon as vc  # noqa: E402

ROOT = vc.ROOT
DOCS = ROOT / "docs"
HCACHE = vc.CACHE / "horizons"
HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
DE421_KERNELS = ["moon_pa_de421_1900-2050.bpc", "moon_080317.tf", "de421.bsp"]
APP_START, APP_END = "2026-01-01T00:00:00Z", "2029-01-01T00:00:00Z"


def stats(x) -> dict:
    x = np.abs(np.asarray(x, dtype=float))
    return {"max": float(x.max()), "rms": float(np.sqrt(np.mean(x * x))), "n": int(x.size)}


def wrap(d):
    return (np.asarray(d) + 180.0) % 360.0 - 180.0


def angle_deg(a, b):
    a = a / np.linalg.norm(a, axis=-1, keepdims=True)
    b = b / np.linalg.norm(b, axis=-1, keepdims=True)
    return np.degrees(np.arctan2(np.linalg.norm(np.cross(a, b), axis=-1), np.sum(a * b, axis=-1)))


def random_epochs_ms(n: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return np.sort(rng.integers(vc.iso_to_ms(APP_START), vc.iso_to_ms(APP_END), n))


def spkcpo_topo(target: str, et: np.ndarray, obs: np.ndarray, frame: str = ml.ME_FRAME) -> np.ndarray:
    return np.array([ml.topocentric_exact_km(target, float(e), obs, frame) for e in et])


# =============================================================== V-1 Horizons
def horizons_query(site: dict, obs_h: float, command: str) -> tuple[str, dict]:
    import requests

    alt_km = (site["elevation_m"] + obs_h) / 1000.0
    lon = site["lon_deg"]
    params = {
        "format": "text", "COMMAND": f"'{command}'", "OBJ_DATA": "NO", "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER", "CENTER": "'coord@301'", "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"'{lon:.6f},{site['lat_deg']:.6f},{alt_km:.6f}'",
        "START_TIME": "'2026-01-01 00:07'", "STOP_TIME": "'2028-12-31 23:00'", "STEP_SIZE": "'9917 m'",
        "QUANTITIES": "'4,20'", "ANG_FORMAT": "DEG", "CSV_FORMAT": "YES", "APPARENT": "AIRLESS",
        "EXTRA_PREC": "YES", "TIME_DIGITS": "SECONDS",
    }
    key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()[:16]
    path = HCACHE / f"{site['id']}_{command}_{key}.txt"
    if path.exists():
        return path.read_text(encoding="utf-8"), {"cache_file": str(path.relative_to(ROOT)), "fetched": False, "params": params}
    HCACHE.mkdir(parents=True, exist_ok=True)
    r = requests.get(HORIZONS_URL, params=params, timeout=120, headers={"User-Agent": "validation-script"})
    r.raise_for_status()
    path.write_text(r.text, encoding="utf-8")
    time.sleep(1.0)  # be polite
    return r.text, {"cache_file": str(path.relative_to(ROOT)), "fetched": True, "params": params}


def parse_horizons(text: str) -> tuple[dict, list]:
    head = {}
    pats = {
        "api_version": r"API VERSION:\s*(\S+)",
        "query_banner": r"Ephemeris / API_USER\s+(.+?)\s+Pasadena",
        "target": r"Target body name:\s*(.+?)\s*\{source:\s*(\S+)\}",
        "center_pole_equ": r"Center pole/equ\s*:\s*(.+?)\s*\{",
        "center_radii": r"Center radii\s*:\s*(.+?)\s*\{",
        "center_geodetic": r"Center geodetic\s*:\s*(.+?)\s*\{",
        "light_bending": r"Rel\. light bend\s*:\s*(.+?)\s*\{source",
        "refraction": r"Atmos refraction:\s*(.+)",
    }
    for k, p in pats.items():
        m = re.search(p, text)
        if m:
            head[k] = m.group(1).strip() if k != "target" else {"name": m.group(1).strip(), "ephemeris_source": m.group(2)}
    m = re.search(r"\$\$SOE(.*?)\$\$EOE", text, re.S)
    rows = []
    if m:
        for line in m.group(1).strip().splitlines():
            f = [x.strip() for x in line.split(",")]
            # Cached Horizons tables may use the default minute precision.
            fmt = "%Y-%b-%d %H:%M" if f[0].count(":") == 1 else "%Y-%b-%d %H:%M:%S"
            if "." in f[0]:
                fmt += ".%f"
            t = datetime.strptime(f[0], fmt).replace(tzinfo=timezone.utc)
            rows.append((int(round(t.timestamp() * 1000)), float(f[3]), float(f[4]), float(f[5]) * vc.AU_KM))
    return head, rows


def v1_horizons(sites_doc, eph) -> dict:
    import spiceypy as sp

    obs_h = sites_doc["observer_height_m"]
    t0, step, table = eph
    out = {"id": "V-1", "refs": ["R-HORIZONS", "R-DE440"], "per_site": {}, "headers": [], "queries": []}
    agg = {b: {p: {k: [] for k in ("daz", "dazcos", "del", "drange_km")} for p in ("spice", "app")} for b in ("sun", "earth")}
    try:
        for site in sites_doc["sites"]:
            obs = vc.observer_km(site, obs_h)
            out["per_site"][site["id"]] = {}
            for body, cmd, col in (("sun", "10", 0), ("earth", "399", 3)):
                text, meta = horizons_query(site, obs_h, cmd)
                head, rows = parse_horizons(text)
                if not rows:
                    raise RuntimeError(f"Horizons returned no data for {site['id']} {cmd}: {text[:400]}")
                out["queries"].append({**{k: meta[k] for k in ("cache_file", "fetched")}, "site": site["id"], "body": body,
                                       "n_epochs": len(rows), "site_coord": meta["params"]["SITE_COORD"]})
                out["headers"].append({"site": site["id"], "body": body, **head})
                t = np.array([r[0] for r in rows])
                h_az, h_el, h_rng = (np.array([r[i] for r in rows]) for i in (1, 2, 3))
                et = np.array([sp.str2et(vc.ms_to_iso(int(x))[:-1]) for x in t])
                spice_v = spkcpo_topo("SUN" if body == "sun" else "EARTH", et, obs)
                app_v = vc.interp_table(t0, step, table, t)[:, col:col + 3] - obs
                rec = {"n_epochs": len(rows), "n_non_hourly": int(np.sum(t % vc.HOUR_MS != 0)),
                       "el_range_deg": [float(h_el.min()), float(h_el.max())]}
                for name, v in (("spice", spice_v), ("app", app_v)):
                    az, el, d = vc.az_el_dist(v, site)
                    daz = wrap(az - h_az)
                    dd = {"daz": daz, "dazcos": daz * np.cos(np.radians(h_el)), "del": el - h_el, "drange_km": d - h_rng}
                    rec[name] = {k: stats(x) for k, x in dd.items()}
                    for k, x in dd.items():
                        agg[body][name][k].append(x)
                out["per_site"][site["id"]][body] = rec
        out["summary"] = {b: {p: {k: stats(np.concatenate(v)) for k, v in agg[b][p].items()} for p in agg[b]} for b in agg}
        out["status"] = "completed"
    except Exception as e:  # network or API failure: record, do not invent
        out["status"] = "not completed"
        out["error"] = f"{type(e).__name__}: {e}"
    return out


# =============================================================== V-2 Moon-centre vs surface point
def v2_aberration(sites_doc, eph) -> dict:
    obs_h = sites_doc["observer_height_m"]
    t_ms = random_epochs_ms(1000, 22)
    et = vc.utc_ms_to_et(t_ms)
    out = {"id": "V-2", "refs": ["R-NAIF-ABCORR", "R-NAIF-SPKPOS"], "n_epochs_per_site": int(t_ms.size), "per_body": {}}
    worst = {"sun": [], "earth": []}
    for site in sites_doc["sites"]:
        obs = vc.observer_km(site, obs_h)
        for body, tgt in (("sun", "SUN"), ("earth", "EARTH")):
            approx = ml.moon_centered_km(tgt, et) - obs
            exact = spkcpo_topo(tgt, et, obs)
            worst[body].append(angle_deg(approx, exact))
    for b in worst:
        out["per_body"][b] = stats(np.concatenate(worst[b]))
    # effect on interval metrics over the app window (hourly, exact Moon-centre vectors vs spkcpo)
    t0, step, table = eph
    n = table.shape[0]
    t = t0 + step * np.arange(n)
    et_h = vc.hourly_et(t0, n)
    eff = {}
    for site in sites_doc["sites"]:
        obs = vc.observer_km(site, obs_h)
        hz, _ = vc.load_horizon(site)
        m_app = vc.interval_metrics(t, table[:, :3] - obs, table[:, 3:] - obs, site, hz)
        m_ex = vc.interval_metrics(t, spkcpo_topo("SUN", et_h, obs), spkcpo_topo("EARTH", et_h, obs), site, hz)
        eff[site["id"]] = {k: m_app[k] - m_ex[k] for k in ("sunlit_hours", "earth_visible_hours", "sunlit_fraction", "earth_visible_fraction")}
    out["metric_effect_2026_2028"] = eff
    out["status"] = "completed"
    return out


# =============================================================== V-3 DE440-ME421 vs DE421 ME
def v3_frames(sites_doc) -> dict:
    import spiceypy as sp

    obs_h = sites_doc["observer_height_m"]
    t_ms = random_epochs_ms(300, 33)
    out = {"id": "V-3", "refs": ["R-NAIF-MOONFK", "R-DE440", "R-DE421"], "n_epochs_per_site": int(t_ms.size)}
    res = {}
    for stack, kdirs, frame in (("de440", None, ml.ME_FRAME), ("de421", True, "MOON_ME_DE421")):
        sp.kclear()
        sp.furnsh(str(vc.CACHE / "kernels" / "naif0012.tls"))
        sp.furnsh(str(vc.CACHE / "kernels" / "pck00011.tpc"))
        if kdirs:
            for k in DE421_KERNELS:
                sp.furnsh(str(vc.CACHE / "kernels_de421" / k))
        else:
            for k in ml.DE440_KERNELS[2:]:
                sp.furnsh(str(vc.CACHE / "kernels" / k))
        et = vc.utc_ms_to_et(t_ms)
        for site in sites_doc["sites"]:
            obs = vc.observer_km(site, obs_h)
            for tgt in ("SUN", "EARTH"):
                v = spkcpo_topo(tgt, et, obs, frame)
                res[(stack, site["id"], tgt)] = vc.az_el_dist(v, site)
    per = {}
    for body, tgt in (("sun", "SUN"), ("earth", "EARTH")):
        daz, dazc, delv = [], [], []
        for site in sites_doc["sites"]:
            a1, e1, _ = res[("de440", site["id"], tgt)]
            a2, e2, _ = res[("de421", site["id"], tgt)]
            daz.append(wrap(a2 - a1))
            dazc.append(wrap(a2 - a1) * np.cos(np.radians(e1)))
            delv.append(e2 - e1)
        per[body] = {"daz": stats(np.concatenate(daz)), "dazcos": stats(np.concatenate(dazc)), "del": stats(np.concatenate(delv))}
    out["azel_de421_minus_de440"] = per
    # frame-only rotation between the two realizations
    sp.kclear()
    sp.furnsh(str(vc.CACHE / "kernels" / "naif0012.tls"))
    sp.furnsh(str(vc.CACHE / "kernels" / "moon_pa_de440_200625.bpc"))
    sp.furnsh(str(vc.CACHE / "kernels" / "moon_de440_250416.tf"))
    sp.furnsh(str(vc.CACHE / "kernels_de421" / "moon_pa_de421_1900-2050.bpc"))
    sp.furnsh(str(vc.CACHE / "kernels_de421" / "moon_080317.tf"))
    et = vc.utc_ms_to_et(t_ms)
    ang, disp = [], {s["id"]: [] for s in sites_doc["sites"]}
    for e in et:
        m = np.array(sp.pxform(ml.ME_FRAME, "MOON_ME_DE421", float(e)))
        q = np.array(sp.m2q(m))
        ang.append(2 * np.degrees(np.arcsin(min(1.0, np.linalg.norm(q[1:])))))
        for s in sites_doc["sites"]:
            p = vc.observer_km(s, 0.0) * 1000.0
            disp[s["id"]].append(float(np.linalg.norm(m @ p - p)))
    out["frame_rotation_angle_deg"] = stats(ang)
    out["frame_rotation_angle_arcsec"] = {k: v * 3600 if k != "n" else v for k, v in stats(ang).items()}
    out["surface_displacement_m"] = {k: stats(v) for k, v in disp.items()}
    out["note"] = ("az/el differences combine the DE421 vs DE440 ephemerides and the frame realizations; "
                   "the pxform rotation isolates the frame part.")
    out["status"] = "completed"
    vc.load_de440()
    return out


# =============================================================== V-4 interpolation
def v4_interp(sites_doc, eph) -> dict:
    t0, step, table = eph
    t_ms = random_epochs_ms(20000, 44)
    et = vc.utc_ms_to_et(t_ms)
    lin = vc.interp_table(t0, step, table, t_ms)
    out = {"id": "V-4", "refs": ["R-NAIF-SPKPOS"], "n_epochs": int(t_ms.size)}
    obs_h = sites_doc["observer_height_m"]
    for body, tgt, col in (("sun", "SUN", 0), ("earth", "EARTH", 3)):
        ex = ml.moon_centered_km(tgt, et)
        li = lin[:, col:col + 3]
        out[body] = {"moon_centred_direction_deg": stats(angle_deg(li, ex)),
                     "moon_centred_distance_rel": stats(np.linalg.norm(li, axis=1) / np.linalg.norm(ex, axis=1) - 1)}
        el_err = []
        for site in sites_doc["sites"]:
            obs = vc.observer_km(site, obs_h)
            _, e1, _ = vc.az_el_dist(li - obs, site)
            _, e2, _ = vc.az_el_dist(ex - obs, site)
            el_err.append(e1 - e2)
        out[body]["topocentric_elevation_deg_all_sites"] = stats(np.concatenate(el_err))
    out["shipped_self_check"] = json.loads((vc.DATA / "ephemeris.json").read_text())["interpolation"]["max_error_vs_spice"]
    out["status"] = "completed"
    return out


# =============================================================== V-5 NASA illumination maps
def frac_count(m) -> float:
    return float(np.mean(np.asarray(m) > 0))


def v5_maps(sites_doc, eph, dem240) -> dict:
    t0, step, table = eph
    obs_h = sites_doc["observer_height_m"]
    out = {"id": "V-5", "refs": ["R-MAZARICO-2011", "R-LOLA-PGDA"], "maps": {}, "per_site": {}}
    maps = {}
    for key, fname in (("sun", "AVGVISIB_65S_240M_201608.TIF"), ("earth", "AVGVISIB_65S_240M_201608_EARTH.TIF")):
        import rasterio

        with rasterio.open(vc.CACHE / "illumination" / fname) as ds:
            out["maps"][key] = {"file": fname, "dtype": ds.dtypes[0], "scale": ds.scales[0], "offset": ds.offsets[0],
                                "nodata": ds.nodata, "pixel_m": ds.transform.a,
                                "label_scaling_factor": 0.00004,
                                "label_note": "LBL: SCALING_FACTOR = 0.00004, OFFSET = 0.0, DN 0..25000 -> 0..1; computed from LDEM_65S_240M"}
        maps[key] = ml.Dem.open(vc.CACHE / "illumination" / fname)  # applies the GeoTIFF scale (= label factor)
    # 18.6-year span of hourly steps (our choice of start epoch; the label does not state the map's span)
    span_start = vc.iso_to_ms("2010-01-01T00:00:00Z")
    n_long = int(round(18.6 * 365.25 * 24))
    et_long = vc.hourly_et(span_start, n_long)
    sun_long = ml.moon_centered_km("SUN", et_long)
    earth_long = ml.moon_centered_km("EARTH", et_long)
    out["long_span"] = {"start_utc": "2010-01-01T00:00:00Z", "n_hours": n_long, "years": 18.6,
                        "method": "SPICE spkpos Moon-centre LT+S at uniform TAI hours minus the site vector (DE440s, MOON_ME_DE440_ME421)"}
    t_app = t0 + step * np.arange(table.shape[0])
    for site in sites_doc["sites"]:
        lat, lon = site["lat_deg"], site["lon_deg"]
        x, y = ml.stereo_south_forward(lat, lon)
        rec = {"map": {}}
        for key, dem in maps.items():
            c = int(np.floor((x - dem.x0) / dem.dx))
            r = int(np.floor((y - dem.y0) / dem.dy))
            nb = dem.data[r - 1:r + 2, c - 1:c + 2]
            raw = np.round(nb[1, 1] / 0.00004)
            rec["map"][key] = {"nearest_pixel_rc": [r, c], "nearest_raw_dn": float(raw), "nearest": float(nb[1, 1]),
                               "bilinear": float(dem.sample_xy(x, y)), "nbhd3x3_min": float(np.nanmin(nb)),
                               "nbhd3x3_max": float(np.nanmax(nb))}
        obs = vc.observer_km(site, obs_h)
        hz_ship, _ = vc.load_horizon(site)
        az_ship = vc.horizon_az(site)
        # surface-observer mask from the 240 m DEM only (closer to the map's set-up)
        hz240 = ml.compute_horizon([dem240], lat, lon, 0.0, 0.5, ml.ray_distances_m())
        obs240 = ml.site_position_km(lat, lon, hz240.obs_radius_m)
        variants = {
            "shipped_mask_80m+240m_obs2m": (hz_ship, az_ship, obs),
            "mask_240m_only_obs0m": (hz240.elev_deg.astype(np.float64), hz240.az_deg, obs240),
        }
        rec["mask_240m_only_obs0m_site_height_m"] = hz240.site_height_m
        ours = {}
        for vname, (hz, az_tab, o) in variants.items():
            row = {}
            for span, ts, sun, earth in (("app_2026_2028", t_app, table[:, :3], table[:, 3:]),
                                         ("long_18p6yr", None, sun_long, earth_long)):
                mg = vc.margins(sun - o, earth - o, site, az_tab, hz)
                row[span] = {"sun_any_part_fraction": frac_count(mg["sun"]),
                             "sun_mean_disk_fraction": float(np.mean(ml.disk_fraction_visible(mg["sun_center"], mg["sun_radius"]))),
                             "earth_center_fraction": frac_count(mg["earth_center"]),
                             "earth_any_part_fraction": frac_count(mg["earth_any"])}
            ours[vname] = row
        rec["ours"] = ours
        ref = ours["shipped_mask_80m+240m_obs2m"]["long_18p6yr"]
        rec["diff_ours_long_shipped_minus_map_nearest"] = {
            "sun_any_part": ref["sun_any_part_fraction"] - rec["map"]["sun"]["nearest"],
            "earth_any_part": ref["earth_any_part_fraction"] - rec["map"]["earth"]["nearest"],
            "earth_center": ref["earth_center_fraction"] - rec["map"]["earth"]["nearest"],
        }
        out["per_site"][site["id"]] = rec
    out["status"] = "completed"
    return out


# =============================================================== V-6 horizon convergence
def v6_convergence(sites_doc, eph, dems) -> dict:
    t0, step, table = eph
    obs_h = sites_doc["observer_height_m"]
    t = t0 + step * np.arange(table.shape[0])
    base_d = ml.ray_distances_m(40.0, 40.0, 0.001, 600_000.0)
    half_d = ml.ray_distances_m(20.0, 20.0, 0.0005, 600_000.0)
    out = {"id": "V-6", "refs": ["R-LOLA-PGDA"], "per_site": {},
           "variants": {"az0.25": "0.25 deg azimuth step, default rays",
                        "rays_half": "0.5 deg step, rays start 20 m, min step 20 m, rel step 0.0005",
                        "az0.25_rays_half": "both"}}
    for site in sites_doc["sites"]:
        lat, lon = (ml.stereo_south_inverse(*site["selection"]["pixel_center_stereo_m"]) if site.get("selection")
                    else (site["lat_deg"], site["lon_deg"]))
        lat, lon = float(lat), float(lon) % 360.0
        obs = vc.observer_km(site, obs_h)
        hz_ship, _ = vc.load_horizon(site)
        az_ship = vc.horizon_az(site)
        base = vc.interval_metrics(t, table[:, :3] - obs, table[:, 3:] - obs, site, hz_ship)
        rec = {"shipped": {k: base[k] for k in ("sunlit_fraction", "earth_visible_fraction")}}
        for name, stepdeg, d in (("az0.25", 0.25, base_d), ("rays_half", 0.5, half_d), ("az0.25_rays_half", 0.25, half_d)):
            try:
                hz = ml.compute_horizon(dems, lat, lon, obs_h, stepdeg, d)
            except MemoryError as e:
                rec[name] = {"status": f"not completed: {e!r}"}
                continue
            el = hz.elev_deg.astype(np.float64)
            common = np.isin(np.round(hz.az_deg, 6), np.round(az_ship, 6))
            diff = el[common] - hz_ship
            # interpolated shipped mask vs fine mask at the fine azimuths (captures between-sample features)
            diff_fine = el - ml.horizon_at(az_ship, hz_ship, hz.az_deg)
            m = vc.interval_metrics(t, table[:, :3] - obs, table[:, 3:] - obs, site, el, az_tab=hz.az_deg)
            rec[name] = {"dH_common_az_deg": stats(diff), "dH_vs_interpolated_shipped_deg": stats(diff_fine),
                         "d_sunlit_fraction": m["sunlit_fraction"] - base["sunlit_fraction"],
                         "d_earth_visible_fraction": m["earth_visible_fraction"] - base["earth_visible_fraction"]}
        out["per_site"][site["id"]] = rec
    out["status"] = "completed"
    return out


# =============================================================== V-7 IM-1 elevation / slope
def v7_im1(sites_doc, dem80) -> dict:
    s = next(x for x in sites_doc["sites"] if x["id"] == "im1-odysseus")
    lat, lon = s["lat_deg"], s["lon_deg"]
    g = np.linspace(-0.005, 0.005, 81)
    LA, LO = np.meshgrid(lat + g, lon + g)
    h = dem80.sample_latlon(LA, LO)
    slope = ml.Dem.open(vc.CACHE / "lola" / "LDSM_80S_80MPP_ADJ.TIF")
    sl = slope.sample_latlon(LA, LO)
    out = {"id": "V-7", "refs": ["R-LROC-1360", "R-NASA-IM1", "R-LOLA-PGDA"],
           "published": {"elevation_m": s["published_elevation_m"], "slope_deg": 12,
                         "slope_note": "LROC 1360 and NASA: local terrain 'sloped at 12 degrees'; baseline not stated on either page"},
           "dem_at_published_point_m": float(dem80.sample_latlon(lat, lon)),
           "sites_json_elevation_m": s["elevation_m"],
           "box": "lat/lon +/- 0.005 deg (rounding of the published 0.01 deg coordinates); about +/-152 m N-S, +/-26 m E-W",
           "dem_box_min_m": float(np.nanmin(h)), "dem_box_max_m": float(np.nanmax(h)),
           "slope_ldsm_pixel_deg": s["slope"]["pixel_deg"], "slope_ldsm_mean3x3_deg": s["slope"]["mean3x3_deg"],
           "slope_box_min_deg": float(np.nanmin(sl)), "slope_box_max_deg": float(np.nanmax(sl))}
    out["elevation_diff_m"] = out["dem_at_published_point_m"] - s["published_elevation_m"]
    out["published_within_box_range"] = bool(out["dem_box_min_m"] <= s["published_elevation_m"] <= out["dem_box_max_m"])
    out["status"] = "completed"
    return out


# =============================================================== V-9 historical epochs
V9_EPOCHS = ["1959-09-13 12:00", "1962-05-15 03:00", "1969-07-20 20:00", "1972-12-11 14:00",
             "1985-05-05 00:00", "1998-07-01 09:00", "2009-10-09 11:00", "2023-08-23 12:00"]


def v9_history(sites_doc) -> dict:
    """Shipped historical ephemeris (hourly samples, linear interpolation) against JPL Horizons at
    epochs from the day Luna 2 reached the Moon to 2023, at the IM-2 analysis point."""
    import requests

    out = {"id": "V-9", "refs": ["R-HORIZONS", "R-NAIF-LSK"], "status": "completed", "epochs": V9_EPOCHS}
    idx = json.loads((ROOT / "public" / "data" / "ephemeris_history.json").read_text(encoding="utf-8"))
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    posix = lambda s: (datetime.fromisoformat(s.replace("Z", "+00:00")) - epoch).total_seconds()
    tables = [(posix(f["t0_utc"]), np.fromfile(ROOT / "public" / "data" / f["file"], "<f8").reshape(-1, 6)) for f in idx["files"]]

    def vectors(p: float) -> np.ndarray:
        for t0, arr in tables:
            if t0 <= p <= t0 + (len(arr) - 1) * 3600:
                fr = (p - t0) / 3600
                i = min(int(fr), len(arr) - 2)
                w = fr - i
                return arr[i] * (1 - w) + arr[i + 1] * w
        raise ValueError(p)

    site = next(s for s in sites_doc["sites"] if s["id"] == "im2-athena")
    obs_h = sites_doc["observer_height_m"]
    obs = ml.site_position_km(site["lat_deg"], site["lon_deg"], ml.R_MOON_M + site["elevation_m"] + obs_h)
    rows, headers = [], []
    for utc in V9_EPOCHS:
        p = posix(utc.replace(" ", "T") + ":00Z")
        v = vectors(p)
        for name, command, off in (("sun", "10", 0), ("earth", "399", 3)):
            params = {
                "format": "text", "COMMAND": f"'{command}'", "OBJ_DATA": "NO", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER",
                "CENTER": "'coord@301'", "COORD_TYPE": "GEODETIC",
                "SITE_COORD": f"'{site['lon_deg']:.6f},{site['lat_deg']:.6f},{(site['elevation_m'] + obs_h) / 1000.0:.6f}'",
                "TLIST": f"'{utc}'", "QUANTITIES": "'4,20'", "ANG_FORMAT": "DEG", "CSV_FORMAT": "YES", "APPARENT": "AIRLESS",
                "EXTRA_PREC": "YES", "TIME_DIGITS": "MINUTES",
            }
            key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()[:16]
            path = HCACHE / f"history_{command}_{key}.txt"
            if path.exists():
                text = path.read_text(encoding="utf-8")
            else:
                HCACHE.mkdir(parents=True, exist_ok=True)
                r = requests.get(HORIZONS_URL, params=params, timeout=120, headers={"User-Agent": "validation-script"})
                r.raise_for_status()
                text = r.text
                path.write_text(text, encoding="utf-8")
                time.sleep(1.0)
            head, hrows = parse_horizons(text)
            if not hrows:
                out.update(status="failed", error=f"no Horizons rows for {utc}"); return out
            headers.append(head)
            _, h_az, h_el, _ = hrows[0]
            az, el = ml.az_el_deg(v[off:off + 3] - obs, site["lat_deg"], site["lon_deg"])
            rows.append({"utc": utc, "body": name, "app_az_deg": float(az), "app_el_deg": float(el), "horizons_az_deg": h_az, "horizons_el_deg": h_el,
                         "d_az_cos_el_deg": float(wrap(az - h_az) * np.cos(np.radians(el))), "d_el_deg": float(el - h_el)})
    out["rows"] = rows
    out["site"] = site["id"]
    out["horizons_source"] = headers[0].get("target", {}).get("ephemeris_source") if headers else None
    for label, sel in (("from_1972", [r for r in rows if r["utc"] >= "1972"]), ("before_1972", [r for r in rows if r["utc"] < "1972"])):
        out[label] = {"az_cos_el": stats([r["d_az_cos_el_deg"] for r in sel]), "el": stats([r["d_el_deg"] for r in sel])}
    return out


# =============================================================== V-8 automated tests
def v8_tests(run: bool) -> dict:
    out = {"id": "V-8", "commands": {"vitest": "npx vitest run", "tsc": "npx tsc --noEmit",
                                     "pytest": "python -m pytest scripts/tests -q"}}
    if not run:
        out["status"] = "not run (--no-tests)"
        return out
    env = dict(os.environ)
    if os.environ.get("VALIDATE_NODE_DIR"):
        env["PATH"] = os.environ["VALIDATE_NODE_DIR"] + os.pathsep + env.get("PATH", "")
    p = subprocess.run([sys.executable, "-m", "pytest", "scripts/tests", "-q"], cwd=ROOT, capture_output=True, text=True)
    last = [l for l in p.stdout.strip().splitlines() if re.search(r"\d+ (passed|failed)", l)]
    counts = {k: int(m.group(1)) for k in ("passed", "failed", "skipped", "error")
              for m in [re.search(rf"(\d+) {k}", last[-1] if last else "")] if m}
    out["pytest"] = {"exit_code": p.returncode, "summary": last[-1].strip("= ") if last else p.stdout[-500:], **counts}
    npx = shutil.which("npx", path=env["PATH"])
    if npx is None:
        out["vitest"] = {"status": "not run: npx not found on PATH (set VALIDATE_NODE_DIR)"}
        out["tsc"] = {"status": "not run: npx not found"}
    else:
        with tempfile.TemporaryDirectory() as td:
            jf = Path(td) / "vitest.json"
            p = subprocess.run([npx, "vitest", "run", "--reporter=json", f"--outputFile={jf}"], cwd=ROOT,
                               capture_output=True, text=True, env=env, shell=os.name == "nt")
            if jf.exists():
                j = json.loads(jf.read_text(encoding="utf-8"))
                out["vitest"] = {"exit_code": p.returncode, "files": len(j["testResults"]),
                                 "total": j["numTotalTests"], "passed": j["numPassedTests"],
                                 "failed": j["numFailedTests"], "skipped": j.get("numPendingTests", 0),
                                 "failed_tests": [a["fullName"] for f in j["testResults"] for a in f["assertionResults"] if a["status"] == "failed"]}
            else:
                out["vitest"] = {"exit_code": p.returncode, "status": "no JSON report", "stderr": p.stderr[-800:]}
        p = subprocess.run([npx, "tsc", "--noEmit"], cwd=ROOT, capture_output=True, text=True, env=env, shell=os.name == "nt")
        out["tsc"] = {"exit_code": p.returncode, "errors": len(re.findall(r"error TS\d+", p.stdout))}
    out["status"] = "completed"
    return out


# =============================================================== Markdown
def f(x, d=3, e=False):
    if x is None:
        return "—"
    return f"{x:.{d}e}" if e else f"{x:.{d}f}"


def render_md(R: dict) -> str:
    L = []
    a = L.append
    a("# Validation report")
    a("")
    a(f"Generated by `python scripts/validate.py` on {R['generated_utc']} from `docs/validation_results.json` "
      "(this file is regenerated from that JSON; do not edit by hand). Reference IDs resolve in `scripts/references.json`.")
    a("")
    a("All angles in degrees unless stated. \"max\" = maximum absolute difference, \"rms\" = root mean square. "
      "Az×cos(el) is the azimuth difference converted to an angle on the sky. Quoted digits are what was computed; "
      "they are not a claim of physical accuracy at that level (the terrain model, not the ephemeris, dominates the error budget).")
    a("")
    # V-1
    v = R["V-1"]
    a("## V-1 JPL Horizons (independent ephemeris service) [R-HORIZONS]")
    a("")
    if v["status"] != "completed":
        a(f"**Not completed:** {v.get('error')}")
    else:
        h = v["headers"][0]
        n_ep = sum(q["n_epochs"] for q in v["queries"])
        a(f"Queries: {len(v['queries'])} ({len(v['queries']) // 2} sites × Sun/Earth), {n_ep} epochs in total, "
          f"{min(q['n_epochs'] for q in v['queries'])} per query, START 2026-01-01 00:07 UT, STEP 9917 min to 2028-12-31 "
          "(mostly non-hourly times). CENTER=coord@301, COORD_TYPE=GEODETIC, SITE_COORD = E-lon, lat, (elevation_m + 2 m)/1000 km, "
          "QUANTITIES=4,20, APPARENT=AIRLESS, EXTRA_PREC=YES. Raw responses cached in `data_cache/horizons/`.")
        a("")
        a(f"Horizons header facts (all queries): API version {h.get('api_version')}; query banner \"{h.get('query_banner')}\"; "
          f"ephemeris source {h.get('target', {}).get('ephemeris_source')}; center pole/equ \"{h.get('center_pole_equ')}\"; "
          f"center radii {h.get('center_radii')}; relativistic light bending by {h.get('light_bending')}; refraction {h.get('refraction')}.")
        a("")
        a("| Body | Path | Az max | Az rms | Az×cos(el) max | El max | El rms | Range max (km) | Range rms (km) |")
        a("|---|---|---|---|---|---|---|---|---|")
        for b in ("sun", "earth"):
            for p, lab in (("spice", "SPICE spkcpo (exact)"), ("app", "App path (hourly, linear)")):
                s = v["summary"][b][p]
                a(f"| {b} | {lab} | {f(s['daz']['max'],2,True)} | {f(s['daz']['rms'],2,True)} | {f(s['dazcos']['max'],2,True)} | "
                  f"{f(s['del']['max'],2,True)} | {f(s['del']['rms'],2,True)} | {f(s['drange_km']['max'],3)} | {f(s['drange_km']['rms'],3)} |")
        a("")
        a("Per-site maxima (Az×cos(el), El) are in the JSON. Known sources of residual difference: Horizons uses DE441 "
          "(this project DE440; the two agree closely over 2026–2028), its own realization of the mean-Earth frame "
          "(\"MEAN_ME (high precision)\"), and includes gravitational light deflection (Sun, Earth) that SPICE LT+S omits; "
          "Horizons converts UTC with the last known leap second, as naif0012.tls does (no leap second 2017–2028). "
          "Horizons prints angles to 1e-9 deg and range to 1e-14 au (~1.5 m). The app-path row additionally contains "
          "the hourly linear-interpolation error (V-4).")
    a("")
    # V-2
    v = R["V-2"]
    a("## V-2 Moon-centre light time/aberration vs surface observer [R-NAIF-ABCORR]")
    a("")
    a(f"Angle between (Moon-centred LT+S vector − site vector) and spkcpo with the surface point as observer, "
      f"{v['n_epochs_per_site']} random epochs × every shipped site, exact SPICE at each epoch (no interpolation):")
    a("")
    for b in ("sun", "earth"):
        a(f"- {b}: max {f(v['per_body'][b]['max'],2,True)} deg, rms {f(v['per_body'][b]['rms'],2,True)} deg")
    a("")
    a("Effect on 2026–2028 hourly interval metrics (app convention minus spkcpo-exact inputs, same masks and rules):")
    a("")
    a("| Site | Δ sunlit h | Δ Earth-visible h |")
    a("|---|---|---|")
    for sid, e in v["metric_effect_2026_2028"].items():
        a(f"| {sid} | {f(e['sunlit_hours'],2,True)} | {f(e['earth_visible_hours'],2,True)} |")
    a("")
    # V-3
    v = R["V-3"]
    a("## V-3 Frame consistency: MOON_ME_DE440_ME421 vs MOON_ME_DE421 (frame of the LOLA products) [R-NAIF-MOONFK] [R-DE421]")
    a("")
    a(f"Full DE421 stack (de421.bsp, moon_pa_de421_1900-2050.bpc, moon_080317.tf, frame `MOON_ME_DE421`) vs the shipped DE440 stack, "
      f"spkcpo at the app observer points, {v['n_epochs_per_site']} random epochs 2026–2028 × every shipped site. DE421 − DE440:")
    a("")
    a("| Body | Az max | Az×cos(el) max | El max | El rms |")
    a("|---|---|---|---|---|")
    for b in ("sun", "earth"):
        s = v["azel_de421_minus_de440"][b]
        a(f"| {b} | {f(s['daz']['max'],2,True)} | {f(s['dazcos']['max'],2,True)} | {f(s['del']['max'],2,True)} | {f(s['del']['rms'],2,True)} |")
    a("")
    fr = v["frame_rotation_angle_arcsec"]
    a(f"Frame-only rotation `pxform(MOON_ME_DE440_ME421 → MOON_ME_DE421)`: max {f(fr['max'],3)}″, rms {f(fr['rms'],3)}″. "
      "Equivalent displacement of the body-fixed site point (surface radius):")
    a("")
    for sid, s in v["surface_displacement_m"].items():
        a(f"- {sid}: max {f(s['max'],2)} m, rms {f(s['rms'],2)} m")
    a("")
    a("The az/el differences combine the different ephemerides (Sun/Earth positions) and the frame realizations; "
      "the rotation isolates the frame part. Compare the displacement with the 80 m DEM pixel.")
    a("")
    # V-4
    v = R["V-4"]
    a("## V-4 Hourly linear interpolation [M-EPHEM]")
    a("")
    a(f"{v['n_epochs']} random UTC epochs 2026–2028, interpolated shipped samples vs direct SPICE spkpos:")
    a("")
    a("| Body | Direction max (deg) | Distance max (rel) | Topocentric el max (deg) | Shipped self-check direction max |")
    a("|---|---|---|---|---|")
    for b in ("sun", "earth"):
        s = v[b]
        a(f"| {b} | {f(s['moon_centred_direction_deg']['max'],2,True)} | {f(s['moon_centred_distance_rel']['max'],2,True)} | "
          f"{f(s['topocentric_elevation_deg_all_sites']['max'],2,True)} | {f(v['shipped_self_check'][b + '_dir_deg'],2,True)} |")
    a("")
    # V-5
    v = R["V-5"]
    a("## V-5 NASA published illumination maps (Mazarico et al. 2011) [R-MAZARICO-2011]")
    a("")
    ms = v["maps"]["sun"]
    a(f"Maps: `AVGVISIB_65S_240M_201608.TIF` (Sun) and `_EARTH.TIF`; GeoTIFF dtype {ms['dtype']}, scale {ms['scale']}, "
      f"offset {ms['offset']}, nodata {ms['nodata']}, {ms['pixel_m']:.0f} m pixels. The PDS labels give SCALING_FACTOR 0.00004 "
      "(DN 0..25000 → 0..1) and describe the value as the fraction of timesteps in which the pixel was lit by any part of the "
      "solar (Earth) disc, computed from LDEM_65S_240M. The GeoTIFF scale equals the label factor, so values below are scaled. "
      "The labels do not state the epoch span of the simulation; our long span is our own choice "
      f"({v['long_span']['n_hours']} hourly steps from {v['long_span']['start_utc']}, 18.6 years).")
    a("")
    a("| Site | Quantity | Map nearest | Map bilinear | Map 3×3 range | Ours 2026–28 (shipped mask) | Ours 18.6 yr (shipped mask) | Ours 18.6 yr (240 m, 0 m obs) | Ours 18.6 yr − map |")
    a("|---|---|---|---|---|---|---|---|---|")
    for sid, s in v["per_site"].items():
        o1 = s["ours"]["shipped_mask_80m+240m_obs2m"]
        o2 = s["ours"]["mask_240m_only_obs0m"]
        for q, mk, ok in (("Sun, any part", "sun", "sun_any_part_fraction"), ("Earth, any part", "earth", "earth_any_part_fraction"),
                          ("Earth, centre", "earth", "earth_center_fraction")):
            mp = s["map"][mk]
            a(f"| {sid} | {q} | {f(mp['nearest'],4)} | {f(mp['bilinear'],4)} | {f(mp['nbhd3x3_min'],3)}–{f(mp['nbhd3x3_max'],3)} | "
              f"{f(o1['app_2026_2028'][ok],4)} | {f(o1['long_18p6yr'][ok],4)} | {f(o2['long_18p6yr'][ok],4)} | "
              f"{f(o1['long_18p6yr'][ok] - mp['nearest'],4)} |")
    a("")
    a("Fractions here are sample counts (hours with margin > 0 / all hours), matching the map's definition, not the app's "
      "interpolated-window hours. Differences are expected from: a different DEM (map: LDEM_65S_240M; ours: 80 m DEM with 240 m "
      "beyond its coverage, observer 2 m above the surface vs the map's surface pixel), the epoch span, and the strong spatial "
      "gradient of illumination on ridges (see the 3×3 range: a one-pixel shift changes the map value by that much). "
      "The column \"240 m, 0 m obs\" uses a horizon recomputed from LDEM_60S_240MPP with the observer on the surface, closer "
      "to the map's set-up. Whether the differences count as agreement is left to the numbers; no tolerance was set in advance.")
    a("")
    for sid, s in v["per_site"].items():
        o2 = s["ours"]["mask_240m_only_obs0m"]["long_18p6yr"]
        a(f"- Evaluated the map's way (240 m DEM, observer on the surface, 18.6 yr), {sid}: ours − map nearest = "
          f"{f(o2['sun_any_part_fraction'] - s['map']['sun']['nearest'], 4)} (Sun, any part), "
          f"{f(o2['earth_any_part_fraction'] - s['map']['earth']['nearest'], 4)} (Earth, any part); "
          f"with the shipped mask: {f(s['diff_ours_long_shipped_minus_map_nearest']['sun_any_part'], 4)} and "
          f"{f(s['diff_ours_long_shipped_minus_map_nearest']['earth_any_part'], 4)}.")
    a("")
    cr = v["per_site"].get("connecting-ridge")
    if cr:
        a(f"**Selection effect (connecting-ridge).** This point was chosen as the pixel with the MAXIMUM map value "
          f"(Sun {f(cr['map']['sun']['nearest'], 4)}) inside the PGDA Site01 footprint, so the map value there is biased high "
          "relative to any independent estimate (\"winner's curse\": the maximum of a noisy field is preferentially a pixel "
          "whose error is positive). A negative ours − map difference at this site is therefore expected in part from the "
          "selection itself, on top of the DEM, observer-height and epoch-span differences, and should not be read as a "
          "deficit of our model alone. The IM-1 and IM-2 points are published landing coordinates and carry no such bias.")
        a("")
    # V-6
    v = R["V-6"]
    a("## V-6 Horizon sampling convergence [M-HORIZON]")
    a("")
    a("Horizon recomputed with `moonlib.compute_horizon` (same DEMs, same observer) at a finer azimuth step and/or halved ray "
      "steps; ΔH compared at the shipped azimuths, and against the linearly interpolated shipped mask at the fine azimuths; "
      "Δ fractions over 2026–2028 using the app rules with the new mask.")
    a("")
    a("| Site | Variant | ΔH max (common az) | ΔH rms | ΔH max vs interpolated shipped | Δ sunlit fraction | Δ Earth-visible fraction |")
    a("|---|---|---|---|---|---|---|")
    for sid, s in v["per_site"].items():
        for name in ("az0.25", "rays_half", "az0.25_rays_half"):
            x = s[name]
            if "status" in x:
                a(f"| {sid} | {name} | {x['status']} | | | | |")
                continue
            a(f"| {sid} | {name} | {f(x['dH_common_az_deg']['max'],4)} | {f(x['dH_common_az_deg']['rms'],4)} | "
              f"{f(x['dH_vs_interpolated_shipped_deg']['max'],4)} | {f(x['d_sunlit_fraction'],2,True)} | {f(x['d_earth_visible_fraction'],2,True)} |")
    a("")
    cr = v["per_site"].get("connecting-ridge", {}).get("rays_half")
    if cr and "status" not in cr:
        a(f"**Not fully converged.** At the connecting ridge, halving the ray step changes H(A) by up to "
          f"{f(cr['dH_common_az_deg']['max'], 3)}° (rms {f(cr['dH_common_az_deg']['rms'], 3)}°) and the 2026–2028 sunlit "
          f"fraction by {f(cr['d_sunlit_fraction'], 4)} ({f(100 * cr['d_sunlit_fraction'], 2)} percentage points; Earth-visible "
          f"fraction by {f(cr['d_earth_visible_fraction'], 2, True)}). Near-field sampling of the bilinear DEM surface on a sharp crest "
          "is not converged at the shipped ray step, so the shipped mask carries a sampling uncertainty of this order there.")
        a("")
    # V-7
    v = R["V-7"]
    a("## V-7 IM-1 site elevation and slope [R-LROC-1360] [R-NASA-IM1]")
    a("")
    a(f"Published: {v['published']['elevation_m']} m elevation, local terrain sloped at {v['published']['slope_deg']}° "
      "(both pages; neither states the slope baseline). "
      f"80 m DEM at the published point: {f(v['dem_at_published_point_m'],1)} m (difference {f(v['elevation_diff_m'],1)} m). "
      f"Over {v['box']}: DEM {f(v['dem_box_min_m'],1)}–{f(v['dem_box_max_m'],1)} m "
      f"(published value {'inside' if v['published_within_box_range'] else 'outside'} this range). "
      f"LOLA slope product (80 m baseline): pixel {v['slope_ldsm_pixel_deg']}°, 3×3 mean {v['slope_ldsm_mean3x3_deg']}°, "
      f"box range {f(v['slope_box_min_deg'],2)}–{f(v['slope_box_max_deg'],2)}°.")
    a("")
    # V-9
    v = R["V-9"]
    a("## V-9 Historical epochs (1959-2023) vs JPL Horizons [R-HORIZONS] [R-NAIF-LSK]")
    a("")
    if v["status"] != "completed":
        a(f"**Not completed:** {v.get('error')}")
    else:
        a(f"Shipped historical ephemeris (hourly samples, linear interpolation, `ephemeris_history.json`) at the {v['site']} analysis point against Horizons "
          f"(source {v['horizons_source']}), one epoch per row and body. Differences are app minus Horizons, in degrees.")
        a("")
        a("| UTC epoch | Body | App az / el | Horizons az / el | Az×cos(el) diff | El diff |")
        a("|---|---|---|---|---|---|")
        for r in v["rows"]:
            a(f"| {r['utc']} | {r['body']} | {f(r['app_az_deg'], 4)} / {f(r['app_el_deg'], 4)} | {f(r['horizons_az_deg'], 4)} / {f(r['horizons_el_deg'], 4)} | {f(r['d_az_cos_el_deg'], 5)} | {f(r['d_el_deg'], 5)} |")
        a("")
        a(f"Maxima from 1972 on: az×cos(el) {f(v['from_1972']['az_cos_el']['max'], 6, True)} deg, el {f(v['from_1972']['el']['max'], 6, True)} deg. "
          f"Before 1972: az×cos(el) {f(v['before_1972']['az_cos_el']['max'], 6, True)} deg, el {f(v['before_1972']['el']['max'], 6, True)} deg. "
          "The larger pre-1972 differences are the expected effect of time scales, not of the geometry: the SPICE leapseconds kernel has no entries before 1972-01-01 "
          "and applies a constant TAI-UTC offset, while the historical UTC used drifting seconds (Horizons additionally treats times before 1962 as UT1); a few seconds of "
          "timing difference is about 0.001 deg of solar motion. Only eight epochs were compared, not a statistical sample.")
        a("")
    # V-8
    v = R["V-8"]
    a("## V-8 Automated tests")
    a("")
    for k in ("vitest", "tsc", "pytest"):
        x = v.get(k, {})
        a(f"- `{v['commands'][k]}`: " + json.dumps({kk: vv for kk, vv in x.items() if kk != 'failed_tests'}) +
          (f" failed: {x['failed_tests']}" if x.get("failed_tests") else ""))
    a("")
    a("## Not validated / open items")
    a("")
    for item in R["not_validated"]:
        a(f"- {item}")
    a("")
    return "\n".join(L)


NOT_VALIDATED = [
    "Power and battery model (M-POWER, M-BATTERY): only analytic unit tests (hand-computed values, energy conservation). "
    "No independent model or measured data was compared; the lander parameters are assumed (A-LANDER).",
    "No comparison with real lander telemetry (IM-1 / IM-2 power or illumination records) was made.",
    "Terrain below the 80 m DEM resolution (boulders, the small crater IM-2 rested in) is not represented; no validation at that scale.",
    "The horizon beyond 600 km is bounded (sites.json unseen_terrain_margin_min_deg) but not computed.",
    "Earth visibility is geometric line of sight only; no link budget, antenna pattern or ground-station availability.",
    "The Space Apps challenge page (R-CHALLENGE) could not be fetched on the build machine (TLS certificate error), "
    "so requirement wording was not re-checked against it.",
    "V-5: the map's simulation epoch span and time step are not stated in the PDS labels; our 18.6-year span start is an arbitrary choice.",
    "Export consistency (CSV/JSON vs displayed numbers) is covered by src/export/exporters.test.ts; see V-8. Browser download behavior is separate from these builder tests.",
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-tests", action="store_true")
    args = ap.parse_args()
    import spiceypy as sp

    vc.load_de440()
    sites_doc = vc.load_sites()
    eph = vc.load_ephemeris()
    R = {"generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
         "command": "python scripts/validate.py",
         "environment": {"python": platform.python_version(), "numpy": np.__version__, "spiceypy": sp.__version__,
                         "cspice": sp.tkvrsn("TOOLKIT")},
         "inputs": {"sites_json_generated_utc": sites_doc["generated_utc"], "observer_height_m": sites_doc["observer_height_m"],
                    "kernels_de440": ml.DE440_KERNELS, "kernels_de421": DE421_KERNELS}}
    steps = [("V-1", lambda: v1_horizons(sites_doc, eph)), ("V-2", lambda: v2_aberration(sites_doc, eph)),
             ("V-3", lambda: v3_frames(sites_doc)), ("V-4", lambda: v4_interp(sites_doc, eph))]
    for k, fn in steps:
        t = time.time()
        print(k, "...", flush=True)
        R[k] = fn()
        print(f"  {R[k]['status']} ({time.time() - t:.0f} s)", flush=True)
    print("loading DEMs ...", flush=True)
    dem80 = ml.Dem.open(vc.CACHE / "lola" / "LDEM_80S_80MPP_ADJ.TIF")
    dem240 = ml.Dem.open(vc.CACHE / "lola" / "LDEM_60S_240MPP_ADJ.TIF")
    for k, fn in (("V-5", lambda: v5_maps(sites_doc, eph, dem240)), ("V-6", lambda: v6_convergence(sites_doc, eph, [dem80, dem240])),
                  ("V-7", lambda: v7_im1(sites_doc, dem80)), ("V-9", lambda: v9_history(sites_doc))):
        t = time.time()
        print(k, "...", flush=True)
        R[k] = fn()
        print(f"  {R[k]['status']} ({time.time() - t:.0f} s)", flush=True)
    del dem80, dem240
    print("V-8 ...", flush=True)
    R["V-8"] = v8_tests(not args.no_tests)
    R["not_validated"] = NOT_VALIDATED
    DOCS.mkdir(exist_ok=True)
    (DOCS / "validation_results.json").write_text(json.dumps(R, indent=1), encoding="utf-8")
    (DOCS / "VALIDATION.md").write_text(render_md(R), encoding="utf-8")
    print("wrote docs/validation_results.json, docs/VALIDATION.md")


if __name__ == "__main__":
    main()
