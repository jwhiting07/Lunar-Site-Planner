"""Unit tests for scripts/moonlib.py.

Pure tests use synthetic inputs only. Tests marked by the ``dems`` fixture need
the LOLA rasters in data_cache/ and are skipped (with the reason) otherwise.
"""
import json
import math

import numpy as np
import pytest

import moonlib as ml
from conftest import ROOT

R = ml.R_MOON_M


# --------------------------------------------------------------------------- geometry
@pytest.mark.parametrize("lat,lon", [(0, 0), (45, 30), (-84.7906, 29.1957), (-89.99, 222.7), (10, -170)])
def test_enu_basis_orthonormal_right_handed(lat, lon):
    e, n, u = ml.enu_basis(lat, lon)
    m = np.array([e, n, u])
    assert np.allclose(m @ m.T, np.eye(3), atol=1e-15)
    assert np.allclose(np.cross(e, n), u, atol=1e-15)
    assert np.allclose(u, ml.unit_radial(lat, lon), atol=1e-15)


def test_enu_basis_known_case():
    e, n, u = ml.enu_basis(0.0, 0.0)
    assert np.allclose(e, [0, 1, 0]) and np.allclose(n, [0, 0, 1]) and np.allclose(u, [1, 0, 0])


def test_az_el_pure_vectors_and_wrap():
    lat, lon = -80.13, 1.44
    e, n, u = ml.enu_basis(lat, lon)
    az, el = ml.az_el_deg(np.array([e, n, u, -e, -n]), lat, lon)
    assert np.allclose(az[[0, 1, 3, 4]], [90, 0, 270, 180], atol=1e-12)
    assert np.allclose(el, [0, 0, 90, 0, 0], atol=1e-12)
    eps = 1e-7
    az_w, _ = ml.az_el_deg(n - eps * e, lat, lon)
    az_e, _ = ml.az_el_deg(n + eps * e, lat, lon)
    assert 359.99999 < az_w < 360.0 and 0.0 <= az_e < 1e-5


def test_site_position_km():
    p = ml.site_position_km(-84.79, 29.2, R + 5321.5)
    assert math.isclose(np.linalg.norm(p), (R + 5321.5) / 1000, rel_tol=1e-15)


# --------------------------------------------------------------------------- destination
def test_destination_from_the_south_pole():
    for az in (0, 37, 180, 300):
        lat2, _ = ml.destination(-90.0, 0.0, az, 100_000.0)
        assert math.isclose(lat2, -90 + math.degrees(100_000 / R), abs_tol=1e-9)


def test_destination_quarter_circles():
    q = math.pi * R / 2
    lat, lon = ml.destination(0.0, 0.0, 0.0, q)
    assert math.isclose(lat, 90.0, abs_tol=1e-9)
    lat, lon = ml.destination(0.0, 0.0, 90.0, q)
    assert math.isclose(lat, 0.0, abs_tol=1e-9) and math.isclose(lon, 90.0, abs_tol=1e-9)
    lat, lon = ml.destination(0.0, 10.0, 270.0, q / 9)  # 10 deg west
    assert math.isclose(lat, 0.0, abs_tol=1e-9) and math.isclose(lon, 0.0, abs_tol=1e-9)


def test_destination_preserves_arc_length_and_initial_azimuth():
    rng = np.random.default_rng(3)
    lat1, lon1 = -84.0, 29.0
    az = rng.uniform(0, 360, 200)
    d = rng.uniform(10, 600_000, 200)
    lat2, lon2 = ml.destination(lat1, lon1, az, d)
    p1 = ml.unit_radial(lat1, lon1)
    p2 = ml.unit_radial(lat2, lon2)
    ang = np.arctan2(np.linalg.norm(np.cross(p1, p2), axis=1), p2 @ p1)
    assert np.allclose(ang * R, d, rtol=1e-9, atol=1e-6)
    # initial direction of the great circle matches the azimuth
    a2, _ = ml.az_el_deg(p2 - p1, lat1, lon1)
    # chord direction tilts down but its azimuth equals the initial azimuth
    assert np.allclose((a2 - az + 180) % 360 - 180, 0, atol=1e-7)


# --------------------------------------------------------------------------- stereographic
def test_stereo_hand_value_and_roundtrip():
    x, y = ml.stereo_south_forward(-80.0, 90.0)
    assert math.isclose(x, 2 * R * math.tan(math.radians(5)), rel_tol=1e-14)
    assert math.isclose(x, 304005.608, abs_tol=1e-3) and abs(y) < 1e-9
    lat = np.array([-89.9999, -85, -60.5, -80.13])
    lon = np.array([10, -170, 179.9, 1.44])
    la, lo = ml.stereo_south_inverse(*ml.stereo_south_forward(lat, lon))
    assert np.allclose(la, lat, atol=1e-12) and np.allclose((lo - lon + 180) % 360 - 180, 0, atol=1e-10)


# --------------------------------------------------------------------------- elevation angle
@pytest.mark.parametrize("h", [2.0, 100.0, 2000.0])
def test_smooth_sphere_dip_is_maximum_over_arc(h):
    arc = np.linspace(1, 200_000, 400_001)
    el = ml.elevation_angle_deg(R + h, R, arc)
    dip = -math.degrees(math.acos(R / (R + h)))
    assert math.isclose(el.max(), dip, abs_tol=1e-6)
    s_tan = R * math.acos(R / (R + h))  # tangent point
    assert abs(arc[np.argmax(el)] - s_tan) < max(5.0, 0.002 * s_tan)


def test_peak_of_known_height():
    # 1000 m peak at 10 km from an observer on the surface:
    # exact: atan2((R+1000) cos t - R, (R+1000) sin t), t = 10 km / R; first order 5.549 deg
    t = 10_000 / R
    expect = math.degrees(math.atan2((R + 1000) * math.cos(t) - R, (R + 1000) * math.sin(t)))
    got = float(ml.elevation_angle_deg(R, R + 1000, 10_000))
    assert math.isclose(got, expect, abs_tol=1e-12)
    assert math.isclose(got, math.degrees(math.atan((1000 - 10_000 ** 2 / (2 * R)) / 10_000)), abs_tol=5e-3)
    assert 5.54 < got < 5.55


# --------------------------------------------------------------------------- horizon_at / disk
def test_horizon_at_interpolation_and_wrap():
    az = np.array([0.0, 90.0, 180.0, 270.0])
    el = np.array([0.0, 4.0, 2.0, -2.0])
    assert np.allclose(ml.horizon_at(az, el, [45, 135, 315, -45, 405, 359.9999999]), [2, 3, -1, -1, 2, 0], atol=1e-6)


def test_disk_fraction_visible():
    assert ml.disk_fraction_visible(-1, 1) == 0 and ml.disk_fraction_visible(1, 1) == 1
    assert math.isclose(ml.disk_fraction_visible(0, 0.27), 0.5, abs_tol=1e-15)
    x = np.linspace(-1, 1, 201)
    f = ml.disk_fraction_visible(x, 1.0)
    assert np.all(np.diff(f) >= 0) and np.allclose(f + f[::-1], 1, atol=1e-12)


# --------------------------------------------------------------------------- ray distances
def test_ray_distances_rules():
    d = ml.ray_distances_m()
    assert d[0] == 40.0 and d[-1] >= 600_000 and d[-2] < 600_000
    steps = np.diff(d)
    assert np.all(steps > 0)
    assert np.allclose(steps, np.maximum(40.0, 0.001 * d[:-1]), rtol=1e-12)
    d2 = ml.ray_distances_m(start_m=10, min_step_m=20, rel_step=0.01, max_m=1000)
    assert d2[0] == 10 and np.allclose(np.diff(d2), np.maximum(20, 0.01 * d2[:-1]))


# --------------------------------------------------------------------------- compute_horizon on synthetic DEMs
def _synthetic_dem(height_fn, half=150_000.0, px=500.0):
    n = int(2 * half / px)
    xc = -half + px * (np.arange(n) + 0.5)
    yc = half - px * (np.arange(n) + 0.5)
    X, Y = np.meshgrid(xc, yc)
    return ml.Dem(height_fn(X, Y).astype(np.float32), -half, half, px, -px, "synthetic")


SITE = (-88.0, 0.0)  # stereo (0, +60.6 km)
DIST = ml.ray_distances_m(max_m=80_000.0)


@pytest.mark.parametrize("h_obs", [2.0, 100.0])
def test_compute_horizon_smooth_sphere_gives_analytic_dip(h_obs):
    dem = _synthetic_dem(lambda X, Y: np.zeros_like(X))
    hz = ml.compute_horizon([dem], *SITE, h_obs, az_step_deg=5.0, distances_m=DIST)
    dip = -math.degrees(math.acos(R / (R + h_obs)))
    assert hz.site_height_m == 0.0 and hz.obs_radius_m == R + h_obs
    # max over the discrete ray samples is within the curvature of the maximum
    assert np.allclose(hz.elev_deg, dip, atol=2e-5)
    assert np.all(hz.elev_deg <= dip + 1e-12)


def test_compute_horizon_synthetic_ridge():
    # 1000 m high plateau for y > 100 km: 39.4 km north of the observer
    dem = _synthetic_dem(lambda X, Y: np.where(Y > 100_000, 1000.0, 0.0))
    hz = ml.compute_horizon([dem], *SITE, 2.0, az_step_deg=5.0, distances_m=DIST)
    _, y_obs = ml.stereo_south_forward(*SITE)
    edge = 100_000 - y_obs
    exp_north = float(ml.elevation_angle_deg(R + 2.0, R + 1000.0, edge + 250.0))  # bilinear edge ~ half a pixel
    assert abs(hz.elev_deg[0] - exp_north) < 0.03, (hz.elev_deg[0], exp_north)
    assert abs(hz.dist_m[0] - edge) < 500
    dip = -math.degrees(math.acos(R / (R + 2.0)))
    az = hz.az_deg
    signed = (az + 180) % 360 - 180
    blocked = np.abs(signed) <= 45
    clear = np.abs(signed) >= 50
    assert np.all(hz.elev_deg[blocked] > 0.05)
    # beyond ~45 deg the plateau edge is > 56 km away and drops below the dip (curvature: 56^2/2R = 0.9 km)
    near = np.abs(signed) <= 40
    assert np.allclose(hz.dist_m[near], edge / np.cos(np.radians(signed[near])), rtol=0.02)
    # obstruction decreases monotonically away from north (the plateau edge recedes as 1/cos A)
    k = int(45 / 5)
    assert np.all(np.diff(hz.elev_deg[: k + 1]) < 0)
    assert np.allclose(hz.elev_deg[clear], dip, atol=2e-5)
    # symmetric about north
    assert np.allclose(hz.elev_deg[1:], hz.elev_deg[1:][::-1], atol=1e-3)


def test_compute_horizon_rejects_observer_without_data():
    dem = _synthetic_dem(lambda X, Y: np.full_like(X, np.nan))
    with pytest.raises(ValueError):
        ml.compute_horizon([dem], *SITE, 2.0, az_step_deg=30.0, distances_m=DIST)


# --------------------------------------------------------------------------- data-dependent
def test_stereo_formulas_vs_pyproj(dems):
    from pyproj import CRS, Transformer

    for dem in dems:
        crs = CRS.from_wkt(dem.crs_wkt)
        tf = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
        rng = np.random.default_rng(11)
        lat, lon = rng.uniform(-90, -60, 3000), rng.uniform(-180, 180, 3000)
        xp, yp = tf.transform(lon, lat)
        xa, ya = ml.stereo_south_forward(lat, lon)
        assert np.max(np.hypot(xa - xp, ya - yp)) < 1e-3


def _sites():
    return json.loads((ROOT / "public" / "data" / "sites.json").read_text(encoding="utf-8"))


def _site_latlon(s):
    if s.get("selection"):
        # build_data used the unrounded pixel-centre coordinates
        lat, lon = ml.stereo_south_inverse(*s["selection"]["pixel_center_stereo_m"])
        return float(lat), float(lon) % 360.0
    return s["lat_deg"], s["lon_deg"]


def test_sites_json_elevations_equal_fresh_dem_sample(dems):
    for s in _sites()["sites"]:
        h, idx = ml.sample_terrain(dems, *_site_latlon(s))
        assert int(idx) == 0, "site should be inside the 80 m DEM"
        assert round(float(h), 1) == s["elevation_m"], (s["id"], float(h))


@pytest.mark.parametrize("site_id", ["im2-athena", "connecting-ridge"])
def test_shipped_horizon_is_reproduced(dems, site_id):
    doc = _sites()
    s = next(x for x in doc["sites"] if x["id"] == site_id)
    hz = ml.compute_horizon(dems, *_site_latlon(s), doc["observer_height_m"], s["horizon"]["az_step_deg"],
                            ml.ray_distances_m(40.0, 40.0, 0.001, 600_000.0))
    n = s["horizon"]["n_az"]
    shipped = np.fromfile(ROOT / "public" / "data" / s["horizon"]["file"], dtype="<f4")
    assert shipped.size == 2 * n
    assert np.array_equal(hz.elev_deg.astype("<f4"), shipped[:n])
    assert np.array_equal(hz.dist_m.astype("<f4"), shipped[n:])
