import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))

ROOT = SCRIPTS.parent
CACHE = ROOT / "data_cache"
LOLA = CACHE / "lola"


def _need(path: Path):
    if not path.exists():
        pytest.skip(f"data file not present: {path.relative_to(ROOT)} (run scripts/fetch_sources.py)")


@pytest.fixture(scope="session")
def dems():
    import moonlib as ml

    p80, p240 = LOLA / "LDEM_80S_80MPP_ADJ.TIF", LOLA / "LDEM_60S_240MPP_ADJ.TIF"
    _need(p80)
    _need(p240)
    return [ml.Dem.open(p80), ml.Dem.open(p240)]


@pytest.fixture(scope="session")
def need_data():
    return _need
