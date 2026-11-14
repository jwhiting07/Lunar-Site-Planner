"""Generate every shipped scientific asset in ``public/data/``.

Inputs  : data_cache/ (SPICE kernels, LOLA rasters; see scripts/fetch_sources.py)
Outputs : public/data/sites.json            site metadata (sourced + computed)
          public/data/horizon_<id>.bin      terrain horizon mask H(A) per site
          public/data/terrain_<id>.bin      reduced local terrain patch per site
          public/data/ephemeris.json        index of the ephemeris sample files
          public/data/ephemeris_<year>.bin  hourly Sun/Earth vectors (Moon ME frame)
          public/data/overview_80S.png      shaded-relief context map (display only)
          public/data/provenance.json       machine-readable provenance manifest

Usage   : python scripts/fetch_sources.py && python scripts/build_data.py

Nothing in this script fabricates data: every number written comes from the
kernels/rasters listed in provenance.json or from sites_input.json (sourced
coordinates). Reference IDs are defined in scripts/references.json.
"""
from __future__ import annotations

import hashlib
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moonlib as ml  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data_cache"
OUT = ROOT / "public" / "data"

# ---- Pipeline parameters (all are modelling choices, documented as such) ----
#: Height of the observer (solar array / antenna reference point) above the DEM
#: surface. ASSUMED demonstration value, not a spacecraft specification. [A-OBS-HEIGHT]
OBSERVER_HEIGHT_M = 2.0
#: Azimuth sampling of the horizon mask. [M-HORIZON]
AZ_STEP_DEG = 0.5
#: Ray sampling: first sample, minimum step, relative step, maximum range. [M-HORIZON]
RAY_START_M, RAY_MIN_STEP_M, RAY_REL_STEP, RAY_MAX_M = 40.0, 40.0, 0.001, 600_000.0
#: Conservative ceiling for lunar terrain height used only to bound the effect of
#: terrain beyond the sampled range (above the tallest terrain in either DEM;
#: checked below). [A-HMAX]
UNSEEN_TERRAIN_HEIGHT_M = 11_000.0
#: Local terrain patch shipped for 3-D display: n x n nodes, +/- half-width. [M-PATCH]
PATCH_N, PATCH_HALF_M = 201, 20_000.0
MOON_COLOR = ROOT / "public" / "textures" / "moon-color.jpg"
#: Ephemeris sampling. [M-EPHEM]
EPHEM_START_UTC, EPHEM_STOP_UTC, EPHEM_STEP_S = "2026-01-01T00:00:00", "2029-01-01T00:00:00", 3600
OVERVIEW_PX = 760  # 80S DEM (7600 px) block-averaged 10x -> 800 m/pix


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_bin(name: str, arr: np.ndarray) -> dict:
    path = OUT / name
    arr.tofile(path)
    return {"file": name, "bytes": path.stat().st_size, "sha256": sha256(path),
            "dtype": str(arr.dtype), "shape": list(arr.shape), "byte_order": "little-endian"}


# --------------------------------------------------------------------------
def check_dem_crs(dem: ml.Dem) -> float:
    """Assert the raster uses the projection this code implements analytically and
    return the largest disagreement (m) between our formulas and PROJ."""
    from pyproj import CRS, Transformer

    crs = CRS.from_wkt(dem.crs_wkt)
    params = {p.name: p.value for p in crs.coordinate_operation.params}
    assert crs.coordinate_operation.method_name.lower().startswith("polar stereographic"), crs
    assert crs.ellipsoid.semi_major_metre == ml.R_MOON_M and crs.ellipsoid.inverse_flattening == 0, crs.ellipsoid
    # true scale at the south pole, central meridian 0, no false origin
    assert params.get("Latitude of standard parallel", params.get("Latitude of natural origin")) == -90.0, params
    assert params.get("Longitude of origin", params.get("Longitude of natural origin")) == 0.0, params
    assert params.get("False easting") == 0.0 and params.get("False northing") == 0.0, params
    tf = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
    rng = np.random.default_rng(1)
    lat = rng.uniform(-90, -60, 2000)
    lon = rng.uniform(-180, 180, 2000)
    xp, yp = tf.transform(lon, lat)
    xa, ya = ml.stereo_south_forward(lat, lon)
    err_fwd = float(np.max(np.hypot(xa - xp, ya - yp)))
    lat_b, lon_b = ml.stereo_south_inverse(xa, ya)
    err_inv = float(np.max(np.abs(lat_b - lat)) + np.max(np.abs((lon_b - lon + 180) % 360 - 180)))
    assert err_fwd < 1e-3 and err_inv < 1e-9, (err_fwd, err_inv)
    return err_fwd


def select_site_point(site: dict) -> tuple[float, float, dict]:
    """Resolve a site's coordinates. Sourced coordinates pass through unchanged;
    'select' sites are located from a published NASA map (documented rule)."""
    if "select" not in site:
        return site["lat_deg"], site["lon_deg"], {}
    import rasterio
    from rasterio.windows import from_bounds

    sel = site["select"]
    assert sel["method"] == "max_avg_illumination_in_box"
    b = sel["box_stereo_m"]
    with rasterio.open(CACHE / "illumination" / sel["map"]) as ds:
        win = from_bounds(b["x_min"], b["y_min"], b["x_max"], b["y_max"], ds.transform).round_offsets().round_lengths()
        vals = ds.read(1, window=win).astype(float)
        scale = ds.scales[0] if ds.scales else 1.0
        offset = ds.offsets[0] if ds.offsets else 0.0
        raw_max = float(np.nanmax(vals))
        r, c = np.unravel_index(np.nanargmax(vals), vals.shape)
        x, y = ds.xy(int(win.row_off) + r, int(win.col_off) + c)  # pixel centre
        info = {"map": sel["map"], "map_pixel_raw_value": raw_max, "map_scale": scale, "map_offset": offset,
                "map_dtype": ds.dtypes[0], "pixel_center_stereo_m": [x, y], "box_stereo_m": b}
    lat, lon = ml.stereo_south_inverse(x, y)
    return float(lat), float(lon) % 360.0, info


def slope_at(lat: float, lon: float) -> dict:
    """LOLA slope product value at the site's pixel plus the 3x3 neighbourhood mean."""
    import rasterio

    x, y = ml.stereo_south_forward(lat, lon)
    with rasterio.open(CACHE / "lola" / "LDSM_80S_80MPP_ADJ.TIF") as ds:
        r, c = ds.index(float(x), float(y))
        win = ds.read(1, window=((r - 1, r + 2), (c - 1, c + 2))).astype(float)
    return {"pixel_deg": round(float(win[1, 1]), 2), "mean3x3_deg": round(float(np.nanmean(win)), 2)}


def terrain_patch(dems: list[ml.Dem], lat: float, lon: float) -> tuple[np.ndarray, float, np.ndarray]:
    """Heights (m above the reference sphere) on an n x n grid of local
    azimuthal-equidistant coordinates: node (i, j) is the point reached from the
    site by travelling arc length hypot(e, n) along azimuth atan2(e, n), with
    e = -half + i*spacing (east), n = -half + j*spacing (north). Row-major [j, i]."""
    axis = np.linspace(-PATCH_HALF_M, PATCH_HALF_M, PATCH_N)
    e, n = np.meshgrid(axis, axis)  # e varies along columns (i), n along rows (j)
    dist = np.hypot(e, n)
    az = np.degrees(np.arctan2(e, n))
    lat2, lon2 = ml.destination(lat, lon, az, dist)
    h, idx = ml.sample_terrain(dems, lat2, lon2)
    if np.isnan(h).any():
        raise ValueError("terrain patch has gaps")
    return h.astype("<f4"), float((idx > 0).mean()), np.stack((lat2, lon2))


def terrain_texture(color: np.ndarray, coordinates: np.ndarray) -> np.ndarray:
    """Bilinearly reproject the NASA SVS equirectangular color map onto the DEM grid."""
    lat, lon = coordinates
    _, height, width = color.shape
    x = ((lon + 180) % 360) / 360 * width - 0.5
    y = np.clip((90 - lat) / 180 * height - 0.5, 0, height - 1)
    col, row = np.floor(x).astype(int), np.floor(y).astype(int)
    dx, dy = x - col, y - row
    next_col, next_row = (col + 1) % width, np.minimum(row + 1, height - 1)
    top = color[:, row, col % width] * (1 - dx) + color[:, row, next_col] * dx
    bottom = color[:, next_row, col % width] * (1 - dx) + color[:, next_row, next_col] * dx
    return np.rint(top * (1 - dy) + bottom * dy).astype(np.uint8)


def build_overview(dem80: ml.Dem) -> dict:
    """Shaded relief of the 80S DEM, block-averaged to 800 m/pix. DISPLAY ONLY:
    the light direction is a fixed cartographic choice, not the real Sun."""
    import rasterio

    f = dem80.data.shape[0] // OVERVIEW_PX
    with np.errstate(invalid="ignore"):
        z = np.nanmean(dem80.data.reshape(OVERVIEW_PX, f, OVERVIEW_PX, f), axis=(1, 3))
    z = np.where(np.isnan(z), np.nanmean(z), z)
    cell = abs(dem80.dx) * f
    gy, gx = np.gradient(z, cell)          # rows increase southward on screen (y decreases)
    slope = np.arctan(2.0 * np.hypot(gx, gy))            # 2x vertical exaggeration
    aspect = np.arctan2(gy, -gx)
    az, alt = np.radians(315.0), np.radians(35.0)        # light from upper-left of the map
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - np.pi / 2 - aspect)
    img = np.clip(40 + 200 * shade, 0, 255).astype(np.uint8)
    path = OUT / "overview_80S.png"
    import warnings

    warnings.filterwarnings("ignore", category=rasterio.errors.NotGeoreferencedWarning)  # plain PNG, by design
    with rasterio.open(path, "w", driver="PNG", width=OVERVIEW_PX, height=OVERVIEW_PX, count=1, dtype="uint8") as dst:
        dst.write(img, 1)
    for aux in OUT.glob("overview_80S.png.aux.xml"):
        aux.unlink()
    return {"file": path.name, "bytes": path.stat().st_size, "sha256": sha256(path), "px": OVERVIEW_PX,
            "half_width_m": abs(dem80.x0), "meters_per_px": cell,
            "projection": "south polar stereographic, sphere 1737.4 km, +y toward lon 0, +x toward lon 90E; image row 0 = +y edge",
            "note": "Shaded relief with a fixed artificial light direction; display only, not a physical illumination state."}


def build_ephemeris() -> tuple[dict, dict, dict]:
    import spiceypy as sp

    ml.load_kernels(CACHE / "kernels", ml.DE440_KERNELS)
    et0, et1 = sp.str2et(EPHEM_START_UTC), sp.str2et(EPHEM_STOP_UTC)
    n_total = round((et1 - et0) / EPHEM_STEP_S)
    # No leap second inside the window according to the LSK, so uniform UTC steps
    # are uniform TAI steps. TDB differs from TAI + 32.184 s by a periodic term of
    # 1.657 ms amplitude (DELTET/K in naif0012.tls) [R-NAIF-LSK] [R-NAIF-TIME], hence the loose tolerance here and the
    # per-sample TAI -> TDB conversion below.
    assert abs((et1 - et0) - n_total * EPHEM_STEP_S) < 0.01
    tai0 = sp.unitim(et0, "TDB", "TAI")
    et = np.array([sp.unitim(tai0 + EPHEM_STEP_S * k, "TAI", "TDB") for k in range(n_total + 1)])
    assert abs(et[-1] - et1) < 1e-6
    sun = ml.moon_centered_km("SUN", et)
    earth = ml.moon_centered_km("EARTH", et)
    table = np.hstack([sun, earth]).astype("<f8")

    files, products = [], {}
    y0, y1 = int(EPHEM_START_UTC[:4]), int(EPHEM_STOP_UTC[:4])
    for year in range(y0, y1):
        a = round((sp.str2et(f"{year}-01-01T00:00:00") - et0) / EPHEM_STEP_S)
        b = round((sp.str2et(f"{year + 1}-01-01T00:00:00") - et0) / EPHEM_STEP_S)
        meta = write_bin(f"ephemeris_{year}.bin", table[a:b + 1])  # inclusive end sample
        files.append({"file": meta["file"], "t0_utc": f"{year}-01-01T00:00:00Z", "n": b - a + 1,
                      "bytes": meta["bytes"]})
        products[meta["file"]] = meta

    # Self-check of the runtime interpolation: linear interpolation of the hourly
    # Moon-centred vectors, evaluated at 15/30/45 min, against direct SPICE values.
    rng = np.random.default_rng(7)
    k = rng.choice(n_total, 4000, replace=False)
    worst = {"sun_dir_deg": 0.0, "earth_dir_deg": 0.0, "sun_dist_rel": 0.0, "earth_dist_rel": 0.0}
    for frac in (0.25, 0.5, 0.75):
        t = et[k] + frac * EPHEM_STEP_S
        for name, col, tab in (("sun", "SUN", sun), ("earth", "EARTH", earth)):
            exact = ml.moon_centered_km(col, t)
            lin = tab[k] * (1 - frac) + tab[k + 1] * frac
            # angle between unit vectors via the chord length (accurate for small angles)
            chord = np.linalg.norm(exact / np.linalg.norm(exact, axis=1, keepdims=True)
                                   - lin / np.linalg.norm(lin, axis=1, keepdims=True), axis=1)
            ang = np.degrees(chord)
            rel = np.abs(np.linalg.norm(lin, axis=1) / np.linalg.norm(exact, axis=1) - 1)
            worst[f"{name}_dir_deg"] = max(worst[f"{name}_dir_deg"], float(ang.max()))
            worst[f"{name}_dist_rel"] = max(worst[f"{name}_dist_rel"], float(rel.max()))

    radii = {b: [float(v) for v in sp.bodvrd(b, "RADII", 3)[1]] for b in ("SUN", "EARTH", "MOON")}
    index = {
        "schema": 1,
        "frame": ml.ME_FRAME,
        "frame_description": "Lunar Mean-Earth/Polar-Axis body-fixed frame (DE440 orientation aligned to DE421 ME). +Z = mean rotation pole (north), +X = mean sub-Earth direction (lon 0), +Y = lon 90E.",
        "center": "Moon centre (NAIF 301)",
        "aberration_correction": ml.ABCORR,
        "units": "km",
        "layout": "row-major float64 little-endian, 6 values per sample: sun_x, sun_y, sun_z, earth_x, earth_y, earth_z",
        "time_system": "UTC (uniform steps; no leap second inside the window per naif0012.tls)",
        "step_s": EPHEM_STEP_S,
        "start_utc": EPHEM_START_UTC + "Z",
        "stop_utc": EPHEM_STOP_UTC + "Z",
        "files": files,
        "body_radii_km": {"sun": radii["SUN"][0], "earth_equatorial": radii["EARTH"][0], "moon": radii["MOON"][0],
                          "source": "pck00011.tpc BODY10_RADII / BODY399_RADII / BODY301_RADII [R-NAIF-PCK]"},
        "interpolation": {"method": "linear in the Moon-centred body-fixed vectors between hourly samples",
                          "max_error_vs_spice": worst,
                          "check": "4000 random hours x {15, 30, 45} min against direct SPICE evaluation"},
        "refs": ["R-DE440", "R-NAIF-MOONFK", "R-NAIF-LSK", "R-NAIF-ABCORR", "R-NAIF-PCK"],
    }
    assert radii["MOON"][0] == ml.R_MOON_KM, radii
    (OUT / "ephemeris.json").write_text(json.dumps(index, indent=1))
    sp.kclear()
    return index, products, worst


# --------------------------------------------------------------------------
def main() -> None:
    import rasterio
    from rasterio.io import MemoryFile

    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((CACHE / "sources_manifest.json").read_text(encoding="utf-8"))
    references = json.loads((Path(__file__).parent / "references.json").read_text(encoding="utf-8"))
    sites_in = json.loads((Path(__file__).parent / "sites_input.json").read_text(encoding="utf-8"))["sites"]
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print("loading DEMs ...", flush=True)
    dem80 = ml.Dem.open(CACHE / "lola" / "LDEM_80S_80MPP_ADJ.TIF")
    dem240 = ml.Dem.open(CACHE / "lola" / "LDEM_60S_240MPP_ADJ.TIF")
    dems = [dem80, dem240]
    proj_err = max(check_dem_crs(dem80), check_dem_crs(dem240))
    dem_max = max(float(np.nanmax(dem80.data)), float(np.nanmax(dem240.data)))
    assert dem_max < UNSEEN_TERRAIN_HEIGHT_M
    print(f"  projection check vs PROJ: {proj_err:.2e} m; max DEM height {dem_max:.0f} m")

    print("ephemeris ...", flush=True)
    eph_index, products, interp = build_ephemeris()
    print("  interpolation error:", interp)

    distances = ml.ray_distances_m(RAY_START_M, RAY_MIN_STEP_M, RAY_REL_STEP, RAY_MAX_M)
    with rasterio.open(MOON_COLOR, GEOREF_SOURCES="NONE") as image:
        moon_color = image.read()
    sites_out = []
    for s in sites_in:
        lat, lon, sel = select_site_point(s)
        print(f"site {s['id']}: lat {lat:.4f} lon {lon:.4f}", flush=True)
        hz = ml.compute_horizon(dems, lat, lon, OBSERVER_HEIGHT_M, AZ_STEP_DEG, distances)
        bound = ml.unseen_terrain_bound_deg(hz.obs_radius_m, hz.coverage_m, UNSEEN_TERRAIN_HEIGHT_M)
        hz_meta = write_bin(f"horizon_{s['id']}.bin",
                            np.concatenate([hz.elev_deg, hz.dist_m]).astype("<f4"))
        patch, patch_far, coordinates = terrain_patch(dems, lat, lon)
        tr_meta = write_bin(f"terrain_{s['id']}.bin", patch)
        texture_path = OUT / f"terrain_color_{s['id']}.png"
        with MemoryFile() as png:
            with png.open(driver="PNG", width=PATCH_N, height=PATCH_N, count=3, dtype="uint8") as image:
                image.write(terrain_texture(moon_color, coordinates))
            texture_path.write_bytes(png.read())
        products[texture_path.name] = {"file": texture_path.name, "bytes": texture_path.stat().st_size,
                                       "sha256": sha256(texture_path)}
        products[hz_meta["file"]] = hz_meta
        products[tr_meta["file"]] = tr_meta
        x, y = ml.stereo_south_forward(lat, lon)
        site = {
            "id": s["id"], "name": s["name"], "short": s["short"],
            "lat_deg": round(lat, 6), "lon_deg": round(lon, 6),
            "coord_class": s["coord_class"], "coord_refs": s["coord_refs"], "coord_note": s["coord_note"],
            "context_refs": s.get("context_refs", []),
            "selection": sel or None,
            "elevation_m": round(hz.site_height_m, 1),
            "elevation_source": "Bilinear sample of LDEM_80S_80MPP_ADJ.TIF at the site coordinates; height above the 1737.4 km sphere [R-LOLA-PGDA]",
            "published_elevation_m": s.get("published_elevation_m"),
            "slope": {**slope_at(lat, lon),
                      "source": "LDSM_80S_80MPP_ADJ.TIF pixel containing the site, and mean of the 3x3 pixels around it [R-LOLA-PGDA]",
                      "note": "Regional slope over an 80 m pixel; context only, not a landing-hazard assessment."},
            "stereo_xy_m": [round(float(x), 1), round(float(y), 1)],
            "terrain_aware": True,
            "horizon": {
                "file": hz_meta["file"],
                "layout": "float32 little-endian: n_az horizon elevations (deg) followed by n_az distances (m) of the horizon-defining terrain sample; azimuth i*az_step_deg clockwise from north",
                "n_az": int(hz.az_deg.size), "az_step_deg": AZ_STEP_DEG,
                "min_deg": round(float(hz.elev_deg.min()), 3), "max_deg": round(float(hz.elev_deg.max()), 3),
                "mean_deg": round(float(hz.elev_deg.mean()), 3),
                "max_obstruction_distance_km": round(float(hz.dist_m.max()) / 1000, 1),
                "fraction_azimuths_beyond_patch": round(float((hz.dist_m > PATCH_HALF_M).mean()), 3),
                "coverage_min_km": round(float(hz.coverage_m.min()) / 1000, 1),
                "unseen_terrain_margin_min_deg": round(float((hz.elev_deg - bound).min()), 2),
                "samples_from_240m_dem_fraction": round(hz.far_dem_fraction, 3),
            },
            "terrain": {
                "file": tr_meta["file"], "n": PATCH_N, "half_width_m": PATCH_HALF_M,
                "texture_file": texture_path.name,
                "spacing_m": 2 * PATCH_HALF_M / (PATCH_N - 1),
                "layout": "float32 little-endian heights (m above the 1737.4 km sphere), row-major [j][i]; node (i,j) lies at local azimuthal-equidistant offsets east = -half + i*spacing, north = -half + j*spacing from the site",
                "min_m": round(float(patch.min()), 1), "max_m": round(float(patch.max()), 1),
                "samples_from_240m_dem_fraction": round(patch_far, 3),
            },
        }
        print(f"  h={site['elevation_m']} m  slope={site['slope']}  horizon {site['horizon']['min_deg']}..{site['horizon']['max_deg']} deg"
              f"  cover>={site['horizon']['coverage_min_km']} km  margin {site['horizon']['unseen_terrain_margin_min_deg']} deg")
        sites_out.append(site)

    overview = build_overview(dem80)
    products[overview["file"]] = {k: overview[k] for k in ("file", "bytes", "sha256")}

    sites_doc = {
        "schema": 1, "generated_utc": now,
        "frame": "Lunar Mean-Earth/Polar-Axis (ME, DE421-aligned); planetocentric latitude, east-positive longitude",
        "reference_radius_m": ml.R_MOON_M,
        "observer_height_m": OBSERVER_HEIGHT_M,
        "overview": overview,
        "sites": sites_out,
    }
    (OUT / "sites.json").write_text(json.dumps(sites_doc, indent=1, ensure_ascii=False), encoding="utf-8")

    import pyproj, rasterio, spiceypy  # noqa: E401

    used = {"ephemeris": ml.DE440_KERNELS,
            "terrain": ["LDEM_80S_80MPP_ADJ.TIF", "LDEM_60S_240MPP_ADJ.TIF"],
            "slope": ["LDSM_80S_80MPP_ADJ.TIF"],
            "site_selection": ["AVGVISIB_65S_240M_201608.TIF"]}
    used_names = sorted({n for v in used.values() for n in v})
    eph_refs = ["R-DE440", "R-NAIF-MOONFK", "R-NAIF-LSK", "R-NAIF-ABCORR", "R-NAIF-SPKPOS"]
    product_docs = []
    for name, meta in sorted(products.items()):
        if name.startswith("ephemeris_"):
            doc = {"description": "Hourly apparent Sun and Earth position vectors relative to the Moon's centre",
                   "inputs": used["ephemeris"], "method": "SPICE spkpos(target, et, MOON_ME_DE440_ME421, LT+S, MOON) at uniform UTC hours (M-EPHEM)",
                   "frame": ml.ME_FRAME, "units": "km", "refs": eph_refs}
        elif name.startswith("horizon_"):
            doc = {"description": "Terrain horizon mask H(A) and distance of the horizon-defining terrain sample",
                   "inputs": used["terrain"],
                   "method": f"Great-circle ray sampling of the DEM with exact spherical curvature (M-HORIZON): azimuth step {AZ_STEP_DEG} deg, samples from {RAY_START_M} m to {RAY_MAX_M / 1000:.0f} km (step max({RAY_MIN_STEP_M} m, {RAY_REL_STEP} x distance)), 80 m DEM where available else 240 m DEM, bilinear interpolation, observer {OBSERVER_HEIGHT_M} m above the DEM surface",
                   "frame": "local East-North-Up at the site; azimuth clockwise from north", "units": "deg, m",
                   "refs": ["R-LOLA-PGDA", "R-SNYDER"]}
        elif name.startswith("terrain_color_"):
            doc = {"description": "Local terrain display texture",
                   "inputs": ["public/textures/moon-color.jpg"], "method": "Bilinear reprojection of the NASA SVS CGI Moon Kit color map onto the site terrain grid; display only",
                   "frame": "local azimuthal-equidistant grid, rows run south to north", "units": "8-bit RGB",
                   "refs": ["R-SVS-MOON-KIT"]}
        elif name.startswith("terrain_"):
            doc = {"description": "Reduced local terrain patch for 3-D display",
                   "inputs": used["terrain"],
                   "method": f"Bilinear DEM samples on a {PATCH_N}x{PATCH_N} local azimuthal-equidistant grid, +/-{PATCH_HALF_M / 1000:.0f} km (M-PATCH)",
                   "frame": "heights above the 1737.4 km reference sphere", "units": "m", "refs": ["R-LOLA-PGDA", "R-SNYDER"]}
        else:
            doc = {"description": "Shaded-relief context map of the region south of 80S (display only)",
                   "inputs": ["LDEM_80S_80MPP_ADJ.TIF"], "method": "10x10 block mean, analytical hillshade with fixed artificial light",
                   "frame": "south polar stereographic", "units": "8-bit grey", "refs": ["R-LOLA-PGDA"]}
        product_docs.append({**meta, **doc, "generated_utc": now})

    provenance = {
        "schema": 1,
        "generated_utc": now,
        "pipeline": {
            "command": "python scripts/fetch_sources.py && python scripts/build_data.py",
            "scripts": {n: sha256(Path(__file__).parent / n) for n in ("build_data.py", "moonlib.py", "fetch_sources.py", "sites_input.json", "references.json")},
            "python": platform.python_version(),
            "packages": {"numpy": np.__version__, "spiceypy": spiceypy.__version__,
                         "cspice_toolkit": spiceypy.tkvrsn("TOOLKIT"), "rasterio": rasterio.__version__, "pyproj": pyproj.__version__},
        },
        "conventions": {
            "body_fixed_frame": ml.ME_FRAME,
            "latitude": "planetocentric, degrees", "longitude": "east-positive, degrees",
            "reference_sphere_radius_m": ml.R_MOON_M,
            "local_frame": "East-North-Up; Up = planetocentric radial direction",
            "azimuth": "clockwise from north, [0, 360) deg", "elevation": "above the local horizontal plane, deg",
            "time": "UTC; TDB via naif0012.tls inside SPICE",
            "units": "SPICE vectors km; terrain and engineering quantities m, W, Wh",
        },
        "parameters": {
            "observer_height_m": {"value": OBSERVER_HEIGHT_M, "class": "assumed", "id": "A-OBS-HEIGHT"},
            "horizon_az_step_deg": {"value": AZ_STEP_DEG, "class": "approximated", "id": "M-HORIZON"},
            "horizon_ray_m": {"value": {"start": RAY_START_M, "min_step": RAY_MIN_STEP_M, "rel_step": RAY_REL_STEP, "max": RAY_MAX_M}, "class": "approximated", "id": "M-HORIZON"},
            "unseen_terrain_height_m": {"value": UNSEEN_TERRAIN_HEIGHT_M, "class": "assumed", "id": "A-HMAX",
                                        "note": f"Conservative ceiling; highest value in the DEMs used is {dem_max:.0f} m"},
            "ephemeris_step_s": {"value": EPHEM_STEP_S, "class": "approximated", "id": "M-EPHEM"},
        },
        "self_checks": {
            "stereographic_formulas_vs_proj_max_m": proj_err,
            "ephemeris_linear_interpolation_max_error": interp,
        },
        "sources": [{"file": n, **manifest[n], "used_for": [k for k, v in used.items() if n in v]} for n in used_names],
        "products": product_docs + [
            {"file": "sites.json", "description": "Site coordinates (sourced), DEM elevation and slope (sampled), horizon/terrain statistics (computed)",
             "inputs": used["terrain"] + used["slope"] + used["site_selection"] + ["scripts/sites_input.json"],
             "refs": ["R-LOLA-PGDA", "R-LROC-1360", "R-NASA-IM1", "R-LROC-1408", "R-LOLA-SITES", "R-MAZARICO-2011"], "generated_utc": now},
            {"file": "ephemeris.json", "description": "Index and conventions of the ephemeris sample files; body radii from the PCK",
             "inputs": used["ephemeris"], "refs": eph_refs + ["R-NAIF-PCK"], "generated_utc": now},
        ],
        "references": references,
    }
    (OUT / "provenance.json").write_text(json.dumps(provenance, indent=1, ensure_ascii=False), encoding="utf-8")
    total = sum(p.stat().st_size for p in OUT.iterdir())
    print(f"wrote {len(list(OUT.iterdir()))} files, {total / 1e6:.2f} MB -> {OUT}")


if __name__ == "__main__":
    main()
