"""Generate src/science/__fixtures__/reference_cases.json for the TypeScript tests.

Usage: python scripts/make_fixtures.py

1. Point cases: for each site in public/data/sites.json, 40 random NON-hourly UTC
   epochs in 2026-2028. Sun and Earth az/el/distance are computed directly with
   SPICE spkcpo (surface point as observer, LT+S, MOON_ME_DE440_ME421) for the
   app's observer point: radius 1737.4 km + elevation_m + observer_height_m.
2. Interval cases: for 3 fixed hour-aligned intervals per site, the interval
   metrics computed by an independent NumPy implementation (scripts/vcommon.py)
   from SPICE spkpos evaluated at the hourly UTC samples (NOT the shipped
   ephemeris files) and the shipped horizon masks.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moonlib as ml  # noqa: E402
import vcommon as vc  # noqa: E402

OUT = vc.ROOT / "src" / "science" / "__fixtures__" / "reference_cases.json"
N_POINTS = 40
INTERVALS = [
    ("2026-12-01T00:00:00Z", "2027-01-01T00:00:00Z"),
    ("2027-03-01T00:00:00Z", "2027-06-01T00:00:00Z"),
    ("2028-01-01T00:00:00Z", "2029-01-01T00:00:00Z"),
]


def main() -> None:
    import spiceypy as sp

    vc.load_de440()
    sites_doc = vc.load_sites()
    obs_h = sites_doc["observer_height_m"]
    t_start = vc.iso_to_ms("2026-01-01T00:00:00Z")
    t_end = vc.iso_to_ms("2029-01-01T00:00:00Z")
    rng = np.random.default_rng(20260601)
    out = {
        "generator": "scripts/make_fixtures.py",
        "kernels": ml.DE440_KERNELS, "frame": ml.ME_FRAME, "abcorr": ml.ABCORR,
        "spicey_toolkit": sp.tkvrsn("TOOLKIT"),
        "point_method": "spkcpo(target, et, MOON_ME_DE440_ME421, 'OBSERVER', 'LT+S', observer_km, 'MOON', MOON_ME_DE440_ME421)",
        "interval_method": "spkpos(target, hourly UTC et, MOON_ME_DE440_ME421, LT+S, MOON) minus observer; moonlib az_el_deg / horizon_at; linear zero crossing (scripts/vcommon.py)",
        "observer_height_m": obs_h,
        "sites": [],
    }
    for site in sites_doc["sites"]:
        obs = vc.observer_km(site, obs_h)
        # random ms offsets, rejected if they fall within 1 s of a whole hour
        t = []
        while len(t) < N_POINTS:
            ms = int(rng.integers(t_start, t_end))
            if 1000 < ms % vc.HOUR_MS < vc.HOUR_MS - 1000:
                t.append(ms)
        t.sort()
        points = []
        for ms in t:
            iso = vc.ms_to_iso(ms)
            et = sp.str2et(iso[:-1])
            rec = {"utc": iso}
            for body, tgt in (("sun", "SUN"), ("earth", "EARTH")):
                v = ml.topocentric_exact_km(tgt, et, obs)
                az, el = ml.az_el_deg(v, site["lat_deg"], site["lon_deg"])
                rec[body] = {"az_deg": float(az), "el_deg": float(el), "dist_km": float(np.linalg.norm(v))}
            points.append(rec)

        hz_elev, _ = vc.load_horizon(site)
        intervals = []
        for a, b in INTERVALS:
            ms0, ms1 = vc.iso_to_ms(a), vc.iso_to_ms(b)
            n = (ms1 - ms0) // vc.HOUR_MS + 1
            et = vc.hourly_et(ms0, n)
            t_ms = ms0 + vc.HOUR_MS * np.arange(n)
            sun = ml.moon_centered_km("SUN", et) - obs
            earth = ml.moon_centered_km("EARTH", et) - obs
            m = vc.interval_metrics(t_ms, sun, earth, site, hz_elev)
            intervals.append({"start_utc": a, "end_utc": b, "metrics": m})
        out["sites"].append({"id": site["id"], "lat_deg": site["lat_deg"], "lon_deg": site["lon_deg"],
                             "observer_radius_km": float(np.linalg.norm(obs)),
                             "points": points, "intervals": intervals})
        print(site["id"], "points", len(points), "intervals", [round(i["metrics"]["sunlit_fraction"], 4) for i in intervals])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
