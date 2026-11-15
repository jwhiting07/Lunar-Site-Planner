"""Reproducible mission-level validation. Run after fetch_sources.py.

Uses the actual TS browser evaluator through Vite, direct SPICE at 5-minute
epochs, fixed untuned geographic holdouts, finer terrain rays, published map
comparisons with one-factor changes, and an independent midpoint battery solver.
Writes docs/VALIDITY.md + validity_results.json and exact search-grid horizons.
No fitted correction factors or fabricated external references.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

import custom_horizon as ch
import moonlib as ml
import vcommon as vc

ROOT = vc.ROOT
CACHE = vc.CACHE


def digest(path):
    if Path(path).suffix in {'.py', '.ts', '.tsx', '.mjs', '.json'}:
        # Git checkouts may use CRLF on Windows and LF elsewhere. Scientific
        # source identity must not depend on that checkout preference.
        return hashlib.sha256(Path(path).read_bytes().replace(b'\r\n', b'\n')).hexdigest()
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def write(path, doc):
    Path(path).write_text(json.dumps(doc, indent=1, allow_nan=False), encoding='utf-8')


def node(mode):
    subprocess.run(['node', 'scripts/run_validity.mjs', mode], cwd=ROOT, check=True)


def profile(hz):
    return {'elevationM': hz.site_height_m, 'observerHeightM': 2, 'coverageKm': float(hz.coverage_m.min()/1000),
            'azStepDeg': float(hz.az_deg[1]), 'elevDeg': hz.elev_deg.tolist(), 'distM': hz.dist_m.tolist()}


def midpoint_battery(case, subdivisions=20000):
    """Independent small-step energy balance, no quadratic roots or production code.
    Midpoint generation, per-substep clipping. Discretization error is measured,
    not presented as spacecraft validation.
    """
    e = case['capacity']
    generated = unserved = curtailed = deficit = 0.0
    minimum = e
    for a, b, p, q in zip(case['hours'][:-1], case['hours'][1:], case['watts'][:-1], case['watts'][1:]):
        dt = (b-a)/subdivisions
        for j in range(subdivisions):
            power = p+(q-p)*(j+0.5)/subdivisions
            generated += power*dt
            proposed = e+(power-case['load'])*dt
            unserved += max(0, -proposed)
            curtailed += max(0, proposed-case['capacity'])
            if proposed < 0:
                deficit += dt
            e = min(case['capacity'], max(0, proposed))
            minimum = min(minimum, e)
    return {'generatedWh': generated, 'unservedWh': unserved, 'curtailedWh': curtailed,
            'minEnergyWh': minimum, 'endEnergyWh': e, 'deficitHours': deficit}


def map_experiment(dems):
    """Same location/epochs/visibility rule; vary only terrain product or height.
    Published map epochs and original DEM realization are not exactly reproduced.
    """
    from validate import frac_count
    t0 = vc.iso_to_ms('2010-01-01T00:00:00Z')
    n = round(18.6*365.25*24)
    et = vc.hourly_et(t0, n)
    sun, earth = ml.moon_centered_km('SUN', et), ml.moon_centered_km('EARTH', et)
    maps = [ml.Dem.open(CACHE/'illumination'/name) for name in
            ['AVGVISIB_65S_240M_201608.TIF', 'AVGVISIB_65S_240M_201608_EARTH.TIF']]
    rows = []
    spec = json.loads((ROOT/'scripts/validity_cases.json').read_text())
    holdouts = [{'id': c['id'], 'lat_deg': c['lat'], 'lon_deg': c['lon']} for c in spec['cases'] if c['lat'] <= -65]
    for site in vc.load_sites()['sites'] + holdouts:
        print('  controlled map comparison', site['id'], flush=True)
        x, y = ml.stereo_south_forward(site['lat_deg'], site['lon_deg'])
        published = [float(m.data[int(np.floor((y-m.y0)/m.dy)), int(np.floor((x-m.x0)/m.dx))]) for m in maps]
        variants = {}
        for label, terrain, height in [('240m_surface', [dems[1]], 0), ('80m_surface', dems, 0), ('80m_2m', dems, 2)]:
            hz = ml.compute_horizon(terrain, site['lat_deg'], site['lon_deg'], height)
            obs = ml.site_position_km(site['lat_deg'], site['lon_deg'], hz.obs_radius_m)
            m = vc.margins(sun-obs, earth-obs, site, hz.az_deg, hz.elev_deg)
            variants[label] = {'sun': frac_count(m['sun']), 'earth_any': frac_count(m['earth_any']),
                               'earth_center': frac_count(m['earth_center'])}
        rows.append({'site': site['id'], 'published': {'sun': published[0], 'earth_any': published[1]},
                     'variants': variants,
                     'resolution_effect_sun_pp': 100*(variants['80m_surface']['sun']-variants['240m_surface']['sun']),
                     'height_effect_sun_pp': 100*(variants['80m_2m']['sun']-variants['80m_surface']['sun']),
                     'remaining_surface_difference_sun_pp': 100*(variants['240m_surface']['sun']-published[0])})
    return {'epochs': '2010-01-01, 18.6 years, hourly; project-selected start epoch',
            'qualification': 'Not an exact reproduction: published map exact start epoch is unconfirmed; its LDEM_65S_240M differs from the adjusted LDEM_60S_240MPP_ADJ used here. No pass tolerance assigned to this contextual comparison.',
            'rows': rows}


def main():
    spec = json.loads((ROOT/'scripts/validity_cases.json').read_text())
    vc.load_de440()
    print('Preparing exact search-grid horizons...', flush=True)
    node('grid')
    points = json.loads((CACHE/'validity_grid.json').read_text())
    sources = {p.name: digest(p) for p in (CACHE/'lola').glob('*.tif')}
    scripts = {name: digest(ROOT/name) for name in ['scripts/custom_horizon.py', 'scripts/moonlib.py', 'scripts/build_data.py']}
    provenance = {'source_sha256': sources, 'generator_sha256': scripts, 'observer_height_m': 2,
                  'text_hash_convention': 'SHA-256 after CRLF-to-LF normalization; binary source hashes are unchanged',
                  'azimuth_step_deg': 0.5, 'ray_range_km': 600,
                  'credits': ['NASA LOLA/PGDA: Barker et al. 2023', 'NASA SVS CGI Moon Kit: regional global LOLA'],
                  'reference_ids': ['R-LOLA-PGDA', 'R-SVS-MOON-KIT', 'M-HORIZON']}
    pack_path = ROOT/'public/data/search_horizons.json'
    previous = json.loads(pack_path.read_text()) if pack_path.exists() else {}
    profiles = previous.get('profiles', {}) if previous.get('provenance') == provenance else {}
    for point in points:
        key = f"{point['lat']:.9f},{point['lon']:.9f}"
        if key not in profiles:
            print('  grid', key, flush=True)
            value = ch.custom_horizon(point['lat'], point['lon'])
            if value is not None:
                profiles[key] = value
            write(pack_path, {'schema': 1, 'provenance': provenance, 'profiles': profiles})
    dems = ch.load_dems()
    cases = []
    references = []
    for c in spec['cases'] + spec['stress_cases']:
        print('Holdout', c['id'], flush=True)
        coarse = ch.custom_horizon(c['lat'], c['lon'])
        if coarse is None:
            raise RuntimeError(f"No terrain coverage for benchmark {c['id']}")
        global_case = 'terrainResolutionM' in coarse
        ds = [ch.load_global_dem()] if global_case else dems
        distances = ml.ray_distances_m(950, 100, 0.0005) if global_case else ml.ray_distances_m(20, 20, 0.0005)
        fine = profile(ml.compute_horizon(ds, c['lat'], c['lon'], 2, 0.25, distances))
        if global_case:
            fine['terrainResolutionM'] = coarse['terrainResolutionM']
        cases.append({**c, 'profile': coarse, 'fine_profile': fine})
        site = {'lat_deg': c['lat'], 'lon_deg': c['lon'], 'elevation_m': coarse['elevationM']}
        start = vc.iso_to_ms(c['start'])
        times = np.arange(start, start+c['days']*24*vc.HOUR_MS+1, 5*60_000, dtype=np.int64)
        obs = vc.observer_km(site, 2)
        et = vc.utc_ms_to_et(times)
        # Exact surface-observer SPICE, not interpolation of shipped vectors.
        sun = np.array([ml.topocentric_exact_km('SUN', float(t), obs) for t in et])
        earth = np.array([ml.topocentric_exact_km('EARTH', float(t), obs) for t in et])
        refs = vc.interval_metrics(times, sun, earth, site, np.array(coarse['elevDeg'], dtype=np.float32).astype(float),
                                   az_tab=np.arange(len(coarse['elevDeg']))*coarse['azStepDeg'])
        references.append({'id': c['id'], 'metrics': refs, 'method': 'direct SPICE spkcpo, 5-minute grid; same float32 terrain profile as browser'})
    power_cases = [
        {'id':'partial-and-cycling','hours':[0,0.3,1.7,2,5,5.3], 'watts':[0,75,600,0,0,400], 'load':150,'capacity':100},
        {'id':'interior-empty-full','hours':[0,1], 'watts':[0,200], 'load':100,'capacity':10},
        {'id':'interior-minimum','hours':[0,1], 'watts':[0,200], 'load':100,'capacity':100},
        {'id':'zero-storage','hours':[0,0.7,2], 'watts':[400,0,300], 'load':150,'capacity':0},
    ]
    write(CACHE/'validity_input.json', {'cases': cases, 'power_cases': power_cases})
    print('Running actual browser modules...', flush=True)
    node('evaluate')
    runtime = json.loads((CACHE/'validity_runtime.json').read_text())
    failures, changes = [], []
    budget = spec['acceptance']
    for row, ref in zip(runtime['cases'], references):
        actual, fine = row['actual'], row['grids']['1']
        row['direct_spice_5min'] = ref
        row['checks'] = {}
        for label, reference in [('one_minute', fine), ('direct_spice', ref['metrics'])]:
            diff = {k: actual[k]-(reference[k] or 0) for k in ['sunlit_fraction','earth_visible_fraction','longest_darkness_hours','longest_blackout_hours']}
            okay = all(abs(diff[k])*100 <= budget['fraction_pp'] for k in ['sunlit_fraction','earth_visible_fraction']) and all(abs(diff[k]) <= budget['outage_hours'] for k in ['longest_darkness_hours','longest_blackout_hours'])
            row['checks'][label] = {'differences': diff, 'within_project_budget': okay}
            if not okay:
                failures.append(row['id']+':'+label)
        relative = abs(actual['generated_wh']-fine['generated_wh'])/max(1, fine['generated_wh'])
        row['checks']['generated_energy_relative'] = relative
        if relative > budget['energy_relative']:
            failures.append(row['id']+':energy')
        if actual['verdict'] != fine['verdict']:
            changes.append(row['id']+':time_refinement')
        if actual['verdict'] != row['terrain_refined']['verdict']:
            changes.append(row['id']+':terrain_refinement')
        row['boundary_sensitive'] = [b for b in row['boundary_tests'] if b['actual'] != b['reference']]
    powers = []
    for case, result in zip(power_cases, runtime['power']):
        ref = midpoint_battery(case)
        diff = {k: result[k]-ref[k] for k in ['generatedWh','unservedWh','curtailedWh','minEnergyWh','deficitHours']}
        diff['endEnergyWh'] = result['energyWh'][-1]-ref['endEnergyWh']
        okay = all(abs(v) <= (0.002 if k == 'deficitHours' else 0.02) for k, v in diff.items())
        powers.append({'case':case,'actual':result,'reference':ref,'differences':diff,'within_numerical_budget':okay})
        if not okay:
            failures.append(case['id']+':power')
    if not runtime['searches'][-1]['matches_exhaustive']:
        failures.append('48-candidate shortlist differs from exhaustive benchmark')
    print('Controlled published-map experiment...', flush=True)
    maps = map_experiment(dems)
    report = {'generated_utc': datetime.now(timezone.utc).isoformat(), 'specification':spec,
              'input_provenance': provenance, 'runtime_source_sha256': {p.relative_to(ROOT).as_posix():digest(p) for p in [ROOT/'src/science/analysis.ts',ROOT/'src/science/planner.ts',ROOT/'src/science/power.ts',ROOT/'src/data/loader.ts']},
              'status':'passed' if not failures else 'needs investigation', 'failures':failures,
              'verdict_sensitivity':changes, 'runtime':runtime, 'power_reference':powers, 'controlled_maps':maps,
              'limits':['Numerical checks are conditional on the DEM, interpolation and idealized hardware assumptions.',
                        'Six geographic holdouts are not statistical or telemetry validation; the geographic cases were selected before this run.',
                        'SPICE and Horizons share JPL ephemeris heritage. A second code path is not independent physical truth.',
                        'The exhaustive search check covers only its specified 147 scenarios. No global optimum is established.',
                        'The published-map experiment cannot establish physical error bounds with unmatched epochs and DEM realizations.']}
    write(ROOT/'docs/validity_results.json', report)
    write(ROOT/'public/data/validity_report.json', report)
    render_report(report)
    print('Wrote docs/VALIDITY.md and docs/validity_results.json:', report['status'], failures, flush=True)
    if failures:
        raise SystemExit(1)


def render_report(report):
    runtime, maps = report['runtime'], report['controlled_maps']
    changes, failures = report['verdict_sensitivity'], report['failures']
    lines = ['# Mission-level validity report', '', f"Generated {report['generated_utc']} by `python scripts/validate_validity.py`.", '',
             f"Status: **{report['status']}**. Numerical budgets are project choices, not NASA specifications.", '',
             '## Mission convergence and direct SPICE comparison', '',
             '| Case | vs 1-min Sun (pp) | Earth (pp) | Darkness (min) | Blackout (min) | vs direct SPICE within budget |',
             '|---|---:|---:|---:|---:|---|']
    for row in runtime['cases']:
        d = row['checks']['one_minute']['differences']
        lines.append(f"| {row['id']} | {d['sunlit_fraction']*100:.5f} | {d['earth_visible_fraction']*100:.5f} | {d['longest_darkness_hours']*60:.3f} | {d['longest_blackout_hours']*60:.3f} | {row['checks']['direct_spice']['within_project_budget']} |")
    lines += ['', '15-minute integration with 5-minute near-horizon probes; hourly display samples. Raw 60/15/5/1-minute calculations, refined terrain, load sensitivity and individual differences are retained in the JSON.', '',
              f"Verdict changes under time/terrain refinement: {changes or 'none in these cases'}. Full numerical failures: {failures or 'none'}.", '',
              'The first six cases are fixed geographic holdouts; three additional published-site regression cases stress long-duration polar transitions. Generated threshold-boundary tests are separate sensitivity checks, not untuned holdout evidence. Threshold disagreements are retained in the JSON.', '',
              '## Terrain comparison with published maps', '', maps['qualification'], '',
              '| Site | Resolution effect, Sun (pp) | Observer-height effect, Sun (pp) | Remaining surface-model minus map (pp) |', '|---|---:|---:|---:|']
    for row in maps['rows']:
        lines.append(f"| {row['site']} | {row['resolution_effect_sun_pp']:.3f} | {row['height_effect_sun_pp']:.3f} | {row['remaining_surface_difference_sun_pp']:.3f} |")
    lines += ['', 'Each effect changes one factor with coordinates, dates and visibility rule held fixed. These effects are conditional on that experiment, not universal error corrections.', '',
              '## Search and power', '', '| Shortlist | Same top five as exhaustive 147-scenario reference | Cached runtime (ms) |', '|---|---|---:|']
    for row in runtime['searches']:
        lines.append(f"| {row['size']} | {row['matches_exhaustive']} | {row['elapsed_ms']:.1f} |")
    lines += ['', f"Default-grid sampled search: {runtime['default_search_count']} scenarios in {runtime['default_search_ms']:.1f} ms with exact precomputed horizons available. This is local calculation time, excluding downloads and cold custom terrain requests.", '',
              'Battery reference: separate Python midpoint integration with 20,000 subdivisions per segment. Acceptance: 0.02 Wh and 0.002 h; full case inputs and errors in JSON. This validates numerical ideal-storage behavior, not real spacecraft performance.', '',
              '## Reproduce', '', 'Run `python scripts/fetch_sources.py`, then `python scripts/validate_validity.py` with Node on PATH. The six holdouts and budgets are frozen in `scripts/validity_cases.json`. Search profiles carry source and generator SHA-256 hashes. No corrected coefficients are fitted to the published maps.', '', '## Limits', '']
    lines += ['- '+x for x in report['limits']]
    (ROOT/'docs/VALIDITY.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
    sensitive = [c['id'] for c in runtime['cases'] if c['boundary_sensitive']]
    with (ROOT/'docs/VALIDITY.md').open('a', encoding='utf-8') as f:
        f.write('\nThreshold-boundary sensitivity: '+str(len(sensitive))+' cases disagree with the 1-minute reference when a target is placed at its exact computed value ('+', '.join(sensitive)+'). These are deliberately constructed boundary tests; numerical agreement within budget does not guarantee a stable verdict exactly on a threshold.\n')


if __name__ == '__main__':
    if '--render-only' in sys.argv:
        render_report(json.loads((ROOT/'docs/validity_results.json').read_text()))
    else:
        main()
