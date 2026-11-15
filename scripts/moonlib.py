"""Scientific core of the offline pipeline (pure NumPy + SPICE + rasterio I/O).

Conventions (documented in docs/REFERENCES_AND_ASSUMPTIONS.md, section 3):
  * Body-fixed frame: lunar Mean-Earth/Polar-Axis (ME). SPICE frame name
    ``MOON_ME_DE440_ME421`` (DE440 orientation aligned to the DE421 ME frame in
    which the LOLA products are expressed)                     [R-NAIF-MOONFK]
  * Latitude planetocentric, longitude positive east, degrees.
  * Reference sphere radius 1737.4 km; LOLA heights are relative to it
                                                               [R-LOLA-PGDA]
  * SPICE vectors in km; terrain and engineering quantities in metres.
    Conversions happen only in functions whose names end in ``_km`` / ``_m``.
  * Local frame: East-North-Up (ENU), "Up" = planetocentric radial direction.
  * Azimuth clockwise from north, [0, 360) deg. Elevation above the local
    horizontal plane, deg.

The TypeScript runtime (src/science/) re-implements the geometry part of this
module; both are tested against the same reference cases.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------
#: LOLA reference sphere radius, metres. [R-LOLA-PGDA] (GeoTIFF CRS, verified by
#: build_data.py at run time) and IAU mean lunar radius [R-IAU-WGCCRE].
R_MOON_M = 1_737_400.0
R_MOON_KM = R_MOON_M / 1000.0

#: Body-fixed frame used for every vector in this project. [R-NAIF-MOONFK]
ME_FRAME = "MOON_ME_DE440_ME421"

#: Aberration correction for apparent directions as seen by an observer on the
#: Moon: one-way light time + stellar aberration. [R-NAIF-ABCORR]
ABCORR = "LT+S"

DEG = np.pi / 180.0


# --------------------------------------------------------------------------
# Spherical geometry (mathematical identities on a sphere)
# --------------------------------------------------------------------------
def unit_radial(lat_deg, lon_deg) -> np.ndarray:
    """Unit radial ("Up") vector in the body-fixed frame for planetocentric lat/lon."""
    lat = np.asarray(lat_deg) * DEG
    lon = np.asarray(lon_deg) * DEG
    return np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], axis=-1)


def site_position_km(lat_deg: float, lon_deg: float, radius_m: float) -> np.ndarray:
    """Body-fixed position (km) of a point at the given planetocentric radius (m)."""
    return unit_radial(lat_deg, lon_deg) * (radius_m / 1000.0)


def enu_basis(lat_deg: float, lon_deg: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """East, North, Up unit vectors (body-fixed components) at lat/lon.

    E = d(r)/d(lon) normalised, N = d(r)/d(lat), U = radial. Right-handed: E x N = U.
    """
    lat, lon = lat_deg * DEG, lon_deg * DEG
    sl, cl = np.sin(lat), np.cos(lat)
    so, co = np.sin(lon), np.cos(lon)
    east = np.array([-so, co, 0.0])
    north = np.array([-sl * co, -sl * so, cl])
    up = np.array([cl * co, cl * so, sl])
    return east, north, up


def az_el_deg(topo_vec, lat_deg: float, lon_deg: float) -> tuple[np.ndarray, np.ndarray]:
    """Azimuth (clockwise from north, [0,360)) and elevation of observer->target vectors.

    ``topo_vec`` has shape (..., 3), body-fixed components, any length unit.
    """
    v = np.asarray(topo_vec, dtype=float)
    east, north, up = enu_basis(lat_deg, lon_deg)
    e, n, u = v @ east, v @ north, v @ up
    az = np.degrees(np.arctan2(e, n)) % 360.0
    el = np.degrees(np.arcsin(np.clip(u / np.linalg.norm(v, axis=-1), -1.0, 1.0)))
    return az, el


def destination(lat_deg: float, lon_deg: float, az_deg, dist_m, radius_m: float = R_MOON_M):
    """Point reached from (lat, lon) along a great circle with initial azimuth ``az``
    after arc length ``dist_m`` measured on the sphere of ``radius_m``.

    Standard spherical "direct problem" (spherical law of cosines / sines).
    Returns (lat_deg, lon_deg) arrays broadcast over az/dist.
    """
    lat1, lon1 = lat_deg * DEG, lon_deg * DEG
    az = np.asarray(az_deg) * DEG
    delta = np.asarray(dist_m) / radius_m
    # At either pole the standard longitude formula is numerically 0/0.
    # Use the limiting east/north basis so every azimuth remains distinct.
    if abs(lat_deg) == 90:
        lat2 = np.sign(lat_deg) * (90 - delta / DEG)
        lon2 = lon_deg + (np.asarray(az_deg) if lat_deg < 0 else 180 - np.asarray(az_deg))
        return np.broadcast_arrays(lat2, lon2)
    sin_lat2 = np.sin(lat1) * np.cos(delta) + np.cos(lat1) * np.sin(delta) * np.cos(az)
    lat2 = np.arcsin(np.clip(sin_lat2, -1.0, 1.0))
    lon2 = lon1 + np.arctan2(np.sin(az) * np.sin(delta) * np.cos(lat1),
                             np.cos(delta) - np.sin(lat1) * sin_lat2)
    return lat2 / DEG, lon2 / DEG


# --------------------------------------------------------------------------
# South polar stereographic projection on a sphere  [R-SNYDER]
# forward: eqs. 21-9 (x), 21-10 (y), 21-12 (rho); inverse: eqs. 20-14, 20-17, 20-18, 21-15
# (polar aspect, true scale at the pole, central meridian 0 deg, k0 = 1)
# --------------------------------------------------------------------------
def stereo_south_forward(lat_deg, lon_deg, radius_m: float = R_MOON_M):
    """(lat, lon) -> (x, y) metres. Longitude 0 points along +y, 90E along +x."""
    lat = np.asarray(lat_deg) * DEG
    lon = np.asarray(lon_deg) * DEG
    rho = 2.0 * radius_m * np.tan(np.pi / 4.0 + lat / 2.0)
    return rho * np.sin(lon), rho * np.cos(lon)


def stereo_south_inverse(x_m, y_m, radius_m: float = R_MOON_M):
    """(x, y) metres -> (lat, lon) degrees, lon in (-180, 180]."""
    x = np.asarray(x_m, dtype=float)
    y = np.asarray(y_m, dtype=float)
    rho = np.hypot(x, y)
    lat = -(np.pi / 2.0 - 2.0 * np.arctan(rho / (2.0 * radius_m)))
    lon = np.arctan2(x, y)
    return lat / DEG, lon / DEG


# --------------------------------------------------------------------------
# DEM access
# --------------------------------------------------------------------------
@dataclass
class Dem:
    """A polar-stereographic raster held in memory, sampled bilinearly."""

    data: np.ndarray          # (rows, cols) float32, NaN = no data
    x0: float                 # x of the outer edge of column 0 (m)
    y0: float                 # y of the outer edge of row 0 (m)
    dx: float                 # pixel width (m, > 0)
    dy: float                 # pixel height (m, < 0 for north-up rasters)
    name: str = ""
    crs_wkt: str = ""

    @classmethod
    def open(cls, path: Path) -> "Dem":
        import rasterio  # local import: only the pipeline needs rasterio

        with rasterio.open(path) as ds:
            band = ds.read(1).astype(np.float32)
            if ds.nodata is not None:
                band[band == ds.nodata] = np.nan
            scale = ds.scales[0] if ds.scales else 1.0
            offset = ds.offsets[0] if ds.offsets else 0.0
            if scale != 1.0 or offset != 0.0:
                band = band * scale + offset
            t = ds.transform
            if t.b != 0.0 or t.d != 0.0:
                raise ValueError("rotated rasters are not supported")
            return cls(band, t.c, t.f, t.a, t.e, Path(path).name, ds.crs.to_wkt() if ds.crs else "")

    def sample_xy(self, x_m, y_m) -> np.ndarray:
        """Bilinear interpolation at projected coordinates. NaN outside coverage or
        when any of the four neighbouring pixels has no data. Pixel values are
        taken to apply at pixel centres."""
        x = np.asarray(x_m, dtype=float)
        y = np.asarray(y_m, dtype=float)
        col = (x - self.x0) / self.dx - 0.5
        row = (y - self.y0) / self.dy - 0.5
        rows, cols = self.data.shape
        c0 = np.floor(col).astype(np.int64)
        r0 = np.floor(row).astype(np.int64)
        ok = (c0 >= 0) & (r0 >= 0) & (c0 < cols - 1) & (r0 < rows - 1)
        c0c = np.clip(c0, 0, cols - 2)
        r0c = np.clip(r0, 0, rows - 2)
        fc = col - c0c
        fr = row - r0c
        d = self.data
        v = (d[r0c, c0c] * (1 - fc) * (1 - fr) + d[r0c, c0c + 1] * fc * (1 - fr)
             + d[r0c + 1, c0c] * (1 - fc) * fr + d[r0c + 1, c0c + 1] * fc * fr)
        return np.where(ok, v, np.nan)

    def sample_latlon(self, lat_deg, lon_deg) -> np.ndarray:
        x, y = stereo_south_forward(lat_deg, lon_deg)
        return self.sample_xy(x, y)


def sample_terrain(dems: list[Dem], lat_deg, lon_deg) -> tuple[np.ndarray, np.ndarray]:
    """Sample the first DEM in ``dems`` that has data at each point.

    Returns (height_m, dem_index) with NaN / -1 where no DEM has data.
    """
    shape = np.broadcast_shapes(np.shape(lat_deg), np.shape(lon_deg))
    h = np.full(shape, np.nan)
    idx = np.full(shape, -1, dtype=np.int8)
    for i, dem in enumerate(dems):
        need = np.isnan(h)
        if not need.any():
            break
        hi = dem.sample_latlon(lat_deg, lon_deg)
        take = need & ~np.isnan(hi)
        h = np.where(take, hi, h)
        idx = np.where(take, i, idx)
    return h, idx


# --------------------------------------------------------------------------
# Terrain horizon  H(A)
# --------------------------------------------------------------------------
def ray_distances_m(start_m: float = 40.0, min_step_m: float = 40.0,
                    rel_step: float = 0.001, max_m: float = 600_000.0) -> np.ndarray:
    """Sample distances along a horizon ray: constant ``min_step_m`` steps near the
    observer, then steps growing as ``rel_step`` x distance (constant angular
    footprint), up to ``max_m``."""
    out = [start_m]
    while out[-1] < max_m:
        out.append(out[-1] + max(min_step_m, rel_step * out[-1]))
    return np.asarray(out)


def elevation_angle_deg(obs_radius_m, target_radius_m, arc_m, sphere_radius_m: float = R_MOON_M):
    """Elevation angle (deg) of a surface point seen from the observer, with exact
    spherical curvature.

    The target is at central angle theta = arc / R from the observer. In the
    observer's local frame its horizontal offset is r_t sin(theta) and its
    vertical offset is r_t cos(theta) - r_o, hence
        elev = atan2(r_t cos(theta) - r_o, r_t sin(theta)).
    """
    theta = np.asarray(arc_m) / sphere_radius_m
    rt = np.asarray(target_radius_m)
    return np.degrees(np.arctan2(rt * np.cos(theta) - obs_radius_m, rt * np.sin(theta)))


@dataclass
class Horizon:
    az_deg: np.ndarray            # (n_az,) azimuths, 0 .. 360-step
    elev_deg: np.ndarray          # (n_az,) terrain horizon elevation H(A)
    dist_m: np.ndarray            # (n_az,) distance of the horizon-defining sample
    coverage_m: np.ndarray        # (n_az,) distance up to which terrain data existed
    site_height_m: float          # DEM height at the observer's ground point
    obs_radius_m: float           # planetocentric radius of the observer's eye point
    far_dem_fraction: float       # fraction of valid samples taken from dems[1:]


def compute_horizon(dems: list[Dem], lat_deg: float, lon_deg: float, observer_height_m: float,
                    az_step_deg: float = 0.5, distances_m: np.ndarray | None = None) -> Horizon:
    """Terrain horizon mask by ray sampling of the DEM(s).

    For each azimuth a great-circle ray is marched outward; at each sample the
    terrain height is read (bilinear) and converted to an elevation angle with
    exact spherical curvature (``elevation_angle_deg``). H(A) is the maximum
    along the ray. A ray stops contributing where no DEM has data; the distance
    reached is reported as ``coverage_m``.
    """
    if distances_m is None:
        distances_m = ray_distances_m()
    az = np.arange(0.0, 360.0, az_step_deg)
    h_site = float(sample_terrain(dems, lat_deg, lon_deg)[0])
    if not np.isfinite(h_site):
        raise ValueError("observer location has no terrain data")
    r_obs = R_MOON_M + h_site + observer_height_m

    lat2, lon2 = destination(lat_deg, lon_deg, az[:, None], distances_m[None, :])
    h, idx = sample_terrain(dems, lat2, lon2)
    valid = np.isfinite(h)
    # A ray is only trusted up to its first data gap.
    contiguous = np.cumprod(valid, axis=1).astype(bool)
    elev = elevation_angle_deg(r_obs, R_MOON_M + h, distances_m[None, :])
    elev = np.where(contiguous, elev, -np.inf)
    k = np.argmax(elev, axis=1)
    rows = np.arange(az.size)
    n_valid = contiguous.sum(axis=1)
    if (n_valid == 0).any():
        raise ValueError("a horizon ray has no terrain data at all")
    coverage = distances_m[n_valid - 1]
    far = float((idx[contiguous] > 0).mean())
    return Horizon(az, elev[rows, k], distances_m[k], coverage, h_site, r_obs, far)


def unseen_terrain_bound_deg(obs_radius_m: float, coverage_m, max_height_m: float) -> np.ndarray:
    """Upper bound on the elevation angle of any terrain beyond the sampled range.

    A point of height ``max_height_m`` is highest in the sky when it is as close
    as possible, i.e. exactly at the coverage limit, so its elevation there
    bounds everything farther out (for coverage beyond the geometric horizon of
    such a peak the bound keeps decreasing with distance).
    """
    return elevation_angle_deg(obs_radius_m, R_MOON_M + max_height_m, coverage_m)


def horizon_at(az_table_deg: np.ndarray, elev_table_deg: np.ndarray, az_deg) -> np.ndarray:
    """H(A): periodic linear interpolation of a horizon mask on a uniform azimuth grid."""
    step = az_table_deg[1] - az_table_deg[0]
    n = az_table_deg.size
    f = (np.asarray(az_deg) % 360.0) / step
    i0 = np.floor(f).astype(np.int64) % n
    i1 = (i0 + 1) % n
    w = f - np.floor(f)
    return elev_table_deg[i0] * (1 - w) + elev_table_deg[i1] * w


# --------------------------------------------------------------------------
# Solar disk
# --------------------------------------------------------------------------
def disk_fraction_visible(center_clearance_deg, angular_radius_deg) -> np.ndarray:
    """Fraction of a uniform circular disk above a straight horizontal edge.

    x = clearance / radius. For |x| < 1 the visible part is the disk minus a
    circular segment:  f = 1 - (acos(x) - x sqrt(1 - x^2)) / pi   [R-SEGMENT].
    f = 0 for x <= -1 and 1 for x >= 1.
    """
    x = np.clip(np.asarray(center_clearance_deg) / np.asarray(angular_radius_deg), -1.0, 1.0)
    return 1.0 - (np.arccos(x) - x * np.sqrt(1.0 - x * x)) / np.pi


# --------------------------------------------------------------------------
# SPICE wrappers
# --------------------------------------------------------------------------
def load_kernels(kernel_dir: Path, names: list[str]) -> None:
    import spiceypy as sp

    sp.kclear()
    for n in names:
        sp.furnsh(str(kernel_dir / n))


DE440_KERNELS = ["naif0012.tls", "pck00011.tpc", "de440s.bsp",
                 "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"]


def moon_centered_km(target: str, et, frame: str = ME_FRAME, abcorr: str = ABCORR) -> np.ndarray:
    """Apparent position (km) of ``target`` relative to the Moon's centre, in the
    Moon body-fixed ``frame`` evaluated at the observation epoch(s) ``et`` (TDB s
    past J2000)."""
    import spiceypy as sp

    et = np.atleast_1d(et)
    pos, _ = sp.spkpos(target, et, frame, abcorr, "MOON")
    return np.asarray(pos)


def topocentric_exact_km(target: str, et: float, site_pos_km: np.ndarray,
                         frame: str = ME_FRAME, abcorr: str = ABCORR) -> np.ndarray:
    """Apparent observer->target vector (km) for an observer fixed on the Moon at
    ``site_pos_km``, computed directly by SPICE (``spkcpo``), with light time and
    stellar aberration evaluated for the surface point itself. Used as the
    reference against which the shipped Moon-centre samples are checked."""
    import spiceypy as sp

    state, _ = sp.spkcpo(target, et, frame, "OBSERVER", abcorr, site_pos_km, "MOON", frame)
    return np.asarray(state[:3])
