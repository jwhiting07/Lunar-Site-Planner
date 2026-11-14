"""Shared helpers for the verification scripts (make_fixtures.py, validate.py, tests).

This is an INDEPENDENT NumPy re-implementation of the runtime analysis rules in
src/science/ (visibility margins, linear zero-crossing windows, complements,
intersections) so the TypeScript code can be checked against it. It reads only
the shipped products in public/data/ and SPICE kernels in data_cache/.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moonlib as ml  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
CACHE = ROOT / "data_cache"
R_SUN_KM = 695_700.0
R_EARTH_KM = 6378.1366
AU_KM = 149_597_870.7
HOUR_MS = 3_600_000


# ---------------------------------------------------------------- shipped data
def load_sites() -> dict:
    return json.loads((DATA / "sites.json").read_text(encoding="utf-8"))


def load_horizon(site: dict) -> tuple[np.ndarray, np.ndarray]:
    n = site["horizon"]["n_az"]
    a = np.fromfile(DATA / site["horizon"]["file"], dtype="<f4")
    assert a.size == 2 * n
    return a[:n].astype(np.float64), a[n:].astype(np.float64)


def horizon_az(site: dict) -> np.ndarray:
    return np.arange(site["horizon"]["n_az"]) * site["horizon"]["az_step_deg"]


def iso_to_ms(s: str) -> int:
    s = s.rstrip("Z")
    dt = datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
    return int(round(dt.timestamp() * 1000))


def ms_to_iso(ms: int) -> str:
    """UTC ISO string with milliseconds and trailing Z (no leap seconds involved in 2026-2028)."""
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def load_ephemeris() -> tuple[int, int, np.ndarray]:
    """Merged shipped ephemeris: (t0_ms, step_ms, table (n, 6) km)."""
    idx = json.loads((DATA / "ephemeris.json").read_text())
    parts = []
    t0 = iso_to_ms(idx["files"][0]["t0_utc"])
    step = int(idx["step_s"] * 1000)
    expect = t0
    for i, f in enumerate(idx["files"]):
        a = np.fromfile(DATA / f["file"], dtype="<f8").reshape(-1, 6)
        assert a.shape[0] == f["n"] and iso_to_ms(f["t0_utc"]) == expect
        parts.append(a if i == 0 else a[1:])
        expect += (f["n"] - 1) * step
    return t0, step, np.vstack(parts)


def interp_table(t0: int, step: int, table: np.ndarray, t_ms) -> np.ndarray:
    """Linear interpolation of the shipped table (app path), (m, 6)."""
    f = (np.asarray(t_ms, dtype=float) - t0) / step
    if np.any(f < 0) or np.any(f > table.shape[0] - 1):
        raise ValueError("outside coverage")
    i = np.minimum(np.floor(f).astype(np.int64), table.shape[0] - 2)
    w = (f - i)[:, None]
    return table[i] * (1 - w) + table[i + 1] * w


def observer_km(site: dict, obs_h: float) -> np.ndarray:
    return ml.site_position_km(site["lat_deg"], site["lon_deg"], ml.R_MOON_M + site["elevation_m"] + obs_h)


# ---------------------------------------------------------------- SPICE
def load_de440() -> None:
    ml.load_kernels(CACHE / "kernels", ml.DE440_KERNELS)


def utc_ms_to_et(t_ms) -> np.ndarray:
    import spiceypy as sp

    return np.array([sp.str2et(ms_to_iso(int(t))[:-1]) for t in np.atleast_1d(t_ms)])


def hourly_et(start_ms: int, n: int) -> np.ndarray:
    """ET of n uniform UTC hours from start_ms (no leap second in 2009-2029 except those in the LSK,
    handled by SPICE per epoch since each epoch is converted individually)."""
    import spiceypy as sp

    et0 = sp.str2et(ms_to_iso(start_ms)[:-1])
    tai0 = sp.unitim(et0, "TDB", "TAI")
    return np.array([sp.unitim(tai0 + 3600.0 * k, "TAI", "TDB") for k in range(n)])


# ---------------------------------------------------------------- analysis rules
def az_el_dist(topo_km: np.ndarray, site: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    az, el = ml.az_el_deg(topo_km, site["lat_deg"], site["lon_deg"])
    return az, el, np.linalg.norm(topo_km, axis=-1)


def find_windows(t: np.ndarray, m: np.ndarray) -> list[tuple[float, float, bool, bool]]:
    """Windows with margin > 0; linear zero crossing between samples (same rule as windows.ts)."""
    out = []
    pos = m > 0
    open_t, trunc_start = (t[0], True) if pos[0] else (None, False)
    for i in range(len(t) - 1):
        if pos[i] == pos[i + 1]:
            continue
        tc = t[i] + m[i] / (m[i] - m[i + 1]) * (t[i + 1] - t[i])
        if pos[i + 1]:
            open_t, trunc_start = tc, False
        else:
            out.append((open_t, tc, trunc_start, False))
            open_t = None
    if open_t is not None:
        out.append((open_t, t[-1], trunc_start, True))
    return out


def complement(ws, start, end):
    out, cur = [], start
    for a, b, *_ in ws:
        if a > cur:
            out.append((cur, a, cur == start, False))
        cur = max(cur, b)
    if cur < end:
        out.append((cur, end, cur == start, True))
    return out


def intersect(a, b):
    out, i, j = [], 0, 0
    while i < len(a) and j < len(b):
        s, e = max(a[i][0], b[j][0]), min(a[i][1], b[j][1])
        if e > s:
            out.append((s, e))
        if a[i][1] < b[j][1]:
            i += 1
        else:
            j += 1
    return out


def total_h(ws) -> float:
    return float(sum(w[1] - w[0] for w in ws)) / HOUR_MS


def longest(ws):
    best = None
    for w in ws:
        if best is None or (w[1] - w[0]) > (best[1] - best[0]):
            best = w
    return best


def margins(sun_topo, earth_topo, site, az_tab, hz_elev) -> dict:
    """Per-sample visibility margins (deg). sun: upper limb above H(A); earth_center: centre
    clearance; earth_any: centre clearance + Earth angular radius (any part of the disc)."""
    s_az, s_el, s_d = az_el_dist(sun_topo, site)
    e_az, e_el, e_d = az_el_dist(earth_topo, site)
    s_h = ml.horizon_at(az_tab, hz_elev, s_az)
    e_h = ml.horizon_at(az_tab, hz_elev, e_az)
    rad = np.degrees(np.arcsin(R_SUN_KM / s_d))
    return {"sun": s_el - s_h + rad, "sun_center": s_el - s_h, "sun_radius": rad,
            "earth_center": e_el - e_h, "earth_any": e_el - e_h + np.degrees(np.arcsin(R_EARTH_KM / e_d))}


def interval_metrics(t_ms: np.ndarray, sun_topo: np.ndarray, earth_topo: np.ndarray, site: dict,
                     hz_elev: np.ndarray, earth_min_clear: float = 0.0, az_tab: np.ndarray | None = None) -> dict:
    """Interval metrics with the app's conventions (upper-limb Sun, Earth centre clearance)."""
    if az_tab is None:
        az_tab = horizon_az(site)
    s_az, s_el, s_d = az_el_dist(sun_topo, site)
    e_az, e_el, _ = az_el_dist(earth_topo, site)
    s_h = ml.horizon_at(az_tab, hz_elev, s_az)
    e_h = ml.horizon_at(az_tab, hz_elev, e_az)
    rad = np.degrees(np.arcsin(R_SUN_KM / s_d))
    sun_m = s_el - s_h + rad
    earth_m = e_el - e_h - earth_min_clear
    t = np.asarray(t_ms, dtype=float)
    start, end = t[0], t[-1]
    hours = (end - start) / HOUR_MS
    sw, ew = find_windows(t, sun_m), find_windows(t, earth_m)
    dark, black = complement(sw, start, end), complement(ew, start, end)
    ld, lb = longest(dark), longest(black)
    disk = ml.disk_fraction_visible(s_el - s_h, rad)
    mean_disk = float(np.sum(0.5 * (disk[1:] + disk[:-1]) * np.diff(t)) / (end - start))
    return {
        "interval_hours": hours,
        "sunlit_hours": total_h(sw), "sunlit_fraction": total_h(sw) / hours,
        "earth_visible_hours": total_h(ew), "earth_visible_fraction": total_h(ew) / hours,
        "both_hours": total_h(intersect(sw, ew)),
        "longest_darkness_hours": None if ld is None else (ld[1] - ld[0]) / HOUR_MS,
        "longest_darkness_truncated": None if ld is None else bool(ld[2] or ld[3]),
        "longest_blackout_hours": None if lb is None else (lb[1] - lb[0]) / HOUR_MS,
        "longest_blackout_truncated": None if lb is None else bool(lb[2] or lb[3]),
        "sunlit_fraction_flat": total_h(find_windows(t, s_el + rad)) / hours,
        "earth_visible_fraction_flat": total_h(find_windows(t, e_el - earth_min_clear)) / hours,
        "mean_disk_fraction": mean_disk,
        "n_sun_windows": len(sw), "n_earth_windows": len(ew),
    }
