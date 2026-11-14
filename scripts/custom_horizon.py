"""Compute a site horizon from the cached south-polar LOLA DEMs."""

import json
import math
import sys

import numpy as np

from build_data import (
    AZ_STEP_DEG, CACHE, OBSERVER_HEIGHT_M, RAY_MAX_M, RAY_MIN_STEP_M,
    RAY_REL_STEP, RAY_START_M, UNSEEN_TERRAIN_HEIGHT_M,
)
from moonlib import Dem, compute_horizon, ray_distances_m, unseen_terrain_bound_deg


_DEMS: list[Dem] | None = None


def load_dems() -> list[Dem]:
    """Open the two LOLA DEMs once per process. Reading them dominates a query
    (about 5 s of deflate decompression against about 1 s of ray sampling), so a
    long-lived `--serve` worker pays it only for its first request."""
    global _DEMS
    if _DEMS is None:
        _DEMS = [Dem.open(CACHE / "lola" / name) for name in ("LDEM_80S_80MPP_ADJ.TIF", "LDEM_60S_240MPP_ADJ.TIF")]
    return _DEMS


def custom_horizon(lat: float, lon: float) -> dict | None:
    if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise ValueError("Invalid lunar coordinates")
    if lat > -60:
        return None
    dems = load_dems()
    distances = ray_distances_m(RAY_START_M, RAY_MIN_STEP_M, RAY_REL_STEP, RAY_MAX_M)
    try:
        horizon = compute_horizon(dems, lat, lon, OBSERVER_HEIGHT_M, AZ_STEP_DEG, distances)
    except ValueError as error:
        if str(error) in {"observer location has no terrain data", "a horizon ray has no terrain data at all"}:
            return None
        raise

    # Accept short rays only when the same conservative bound used for shipped
    # sites proves that terrain beyond the sampled coverage cannot raise the skyline.
    bound = unseen_terrain_bound_deg(horizon.obs_radius_m, horizon.coverage_m, UNSEEN_TERRAIN_HEIGHT_M)
    if np.any((horizon.coverage_m < RAY_MAX_M) & (horizon.elev_deg <= bound)):
        return None
    return {
        "elevationM": horizon.site_height_m,
        "observerHeightM": OBSERVER_HEIGHT_M,
        "coverageKm": float(horizon.coverage_m.min() / 1000),
        "azStepDeg": AZ_STEP_DEG,
        "elevDeg": horizon.elev_deg.tolist(),
        "distM": horizon.dist_m.tolist(),
    }


def serve() -> None:
    """Worker mode: one "<lat> <lon>" request per stdin line, one JSON reply line
    per request: {"ok": true, "result": <horizon or null>} or {"ok": false, "error": "..."}."""
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            reply = {"ok": True, "result": custom_horizon(*map(float, line.split()))}
            text = json.dumps(reply, allow_nan=False)
        except Exception as error:  # report, keep serving
            text = json.dumps({"ok": False, "error": str(error)})
        print(text, flush=True)


if __name__ == "__main__":
    if sys.argv[1:] == ["--serve"]:
        serve()
    else:
        print(json.dumps(custom_horizon(*map(float, sys.argv[1:])), allow_nan=False))
