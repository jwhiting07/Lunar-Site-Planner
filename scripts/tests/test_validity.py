"""Check that shipped validation evidence belongs to the current science code."""
import hashlib
import json

import pytest

from conftest import ROOT
from validate_validity import midpoint_battery


def test_published_report_matches_science_and_frozen_benchmark():
    report = json.loads((ROOT/'docs/validity_results.json').read_text())
    assert report['specification'] == json.loads((ROOT/'scripts/validity_cases.json').read_text())
    assert report['status'] == 'passed', report['failures']
    for path, expected in report['runtime_source_sha256'].items():
        assert hashlib.sha256((ROOT/path).read_bytes().replace(b'\r\n', b'\n')).hexdigest() == expected, f'Regenerate validity evidence after editing {path}'
    assert json.loads((ROOT/'public/data/validity_report.json').read_text()) == report


def test_search_profiles_are_finite_complete_and_traceable():
    pack = json.loads((ROOT/'public/data/search_horizons.json').read_text())
    assert pack['schema'] == 1
    assert len(pack['profiles']) == 49
    for path, expected in pack['provenance']['generator_sha256'].items():
        assert hashlib.sha256((ROOT/path).read_bytes().replace(b'\r\n', b'\n')).hexdigest() == expected
    for profile in pack['profiles'].values():
        assert len(profile['elevDeg']) == len(profile['distM']) == 360/profile['azStepDeg']
        assert all(-90 <= x <= 90 for x in profile['elevDeg'])
        assert profile['observerHeightM'] == 2


@pytest.mark.parametrize('capacity,minimum,unserved', [(10, 0, 15), (100, 75, 0)])
def test_independent_midpoint_reference_against_analytic_triangles(capacity, minimum, unserved):
    result = midpoint_battery({'hours':[0,1], 'watts':[0,200], 'load':100, 'capacity':capacity})
    assert result['minEnergyWh'] == pytest.approx(minimum, abs=1e-6)
    assert result['unservedWh'] == pytest.approx(unserved, abs=1e-6)
