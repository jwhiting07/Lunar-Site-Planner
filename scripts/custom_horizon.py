"""Compute a site horizon from cached polar or global LOLA elevation data."""

import json
import math
import sys

import numpy as np

from build_data import (
    AZ_STEP_DEG, CACHE, OBSERVER_HEIGHT_M, RAY_MAX_M, RAY_MIN_STEP_M,
    RAY_REL_STEP, RAY_START_M, UNSEEN_TERRAIN_HEIGHT_M,
)
from moonlib import Dem, R_MOON_M, compute_horizon, ray_distances_m, unseen_terrain_bound_deg


_DEMS: list[Dem] | None = None
_GLOBAL_DEM: Dem | None = None
GLOBAL_FILENAME = "ldem_16_uint.tif"
GLOBAL_PPD = 16


class GlobalDem(Dem):
    def sample_latlon(self, lat_deg, lon_deg) -> np.ndarray:
        # Latitude ends at the last pixel centre. Longitude wraps across the padded seam.
        edge = 90 - 0.5 / GLOBAL_PPD
        return self.sample_xy((np.asarray(lon_deg) + 180) % 360 - 180, np.clip(lat_deg, -edge, edge))


def load_global_dem() -> Dem | None:
    global _GLOBAL_DEM
    if _GLOBAL_DEM is None:
        path = CACHE / "lola" / GLOBAL_FILENAME
        if not path.is_file():
            return None
        import rasterio

        with rasterio.open(path) as raster:
            if (raster.height, raster.width) != (180 * GLOBAL_PPD, 360 * GLOBAL_PPD) or raster.dtypes[0] != "uint16":
                raise ValueError(f"Unexpected raster dimensions or encoding in {GLOBAL_FILENAME}")
            band = raster.read(1).astype(np.float32)
        # NASA SVS 4720: half-metres with 10 km added to the LOLA reference elevation.
        band = band * 0.5 - 10_000
        cell = 1 / GLOBAL_PPD
        band = np.pad(band, ((1, 1), (0, 0)), mode="edge")
        band = np.pad(band, ((0, 0), (1, 1)), mode="wrap")
        _GLOBAL_DEM = GlobalDem(band, -180 - cell, 90 + cell, cell, -cell)
    return _GLOBAL_DEM


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
    distances = ray_distances_m(RAY_START_M, RAY_MIN_STEP_M, RAY_REL_STEP, RAY_MAX_M)
    if lat <= -60:
        try:
            polar = horizon_profile(load_dems(), lat, lon, distances)
        except OSError:
            polar = None
        if polar is not None:
            return polar
    global_dem = load_global_dem()
    if global_dem is None:
        return None
    # Do not probe apparent metre-scale relief in a raster with ~1.9 km cells at the equator.
    global_distances = ray_distances_m(950.0, 200.0, RAY_REL_STEP, RAY_MAX_M)
    profile = horizon_profile([global_dem], lat, lon, global_distances)
    return {**profile, "terrainResolutionM": round(2 * math.pi * R_MOON_M / (360 * GLOBAL_PPD))} if profile else None


def horizon_profile(dems, lat, lon, distances) -> dict | None:
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
