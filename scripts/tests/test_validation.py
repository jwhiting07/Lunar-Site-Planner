from datetime import datetime, timezone

import pytest

from validate import parse_horizons


@pytest.mark.parametrize("stamp", ["2026-Jan-01 00:07", "2026-Jan-01 00:07:00", "2026-Jan-01 00:07:00.000"])
def test_horizons_time_precision(stamp):
    _, rows = parse_horizons(f"$$SOE\n {stamp}, , , 123.4, -5.6, 1.0, 0,\n$$EOE")
    assert rows == [(int(datetime(2026, 1, 1, 0, 7, tzinfo=timezone.utc).timestamp() * 1000),
                     123.4, -5.6, 149597870.7)]
