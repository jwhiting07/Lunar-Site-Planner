# Mission-level validity report

Generated 2026-11-15T18:12:11.381278+00:00 by `python scripts/validate_validity.py`.

Status: **passed**. Numerical budgets are project choices, not NASA specifications.

## Mission convergence and direct SPICE comparison

| Case | vs 1-min Sun (pp) | Earth (pp) | Darkness (min) | Blackout (min) | vs direct SPICE within budget |
|---|---:|---:|---:|---:|---|
| polar-interior | 0.00000 | 0.00000 | 0.000 | 0.000 | True |
| polar-offset | 0.00000 | 0.00000 | 0.000 | 0.000 | True |
| polar-custom | 0.00000 | 0.00000 | 0.000 | 0.000 | True |
| polar-edge | 0.00000 | 0.00000 | 0.000 | 0.000 | True |
| global-east-seam | -0.00000 | 0.00000 | 0.000 | 0.000 | True |
| global-west-seam | -0.00000 | 0.00000 | 0.000 | 0.000 | True |
| regression-ridge | 0.00000 | 0.00000 | -0.001 | -0.000 | True |
| regression-peak-5 | -0.00002 | 0.00000 | 0.008 | -0.000 | True |
| regression-im2 | -0.00000 | 0.00000 | -0.000 | -0.000 | True |

15-minute integration with 5-minute near-horizon probes; hourly display samples. Raw 60/15/5/1-minute calculations, refined terrain, load sensitivity and individual differences are retained in the JSON.

Verdict changes under time/terrain refinement: none in these cases. Full numerical failures: none.

The first six cases are fixed geographic holdouts; three additional published-site regression cases stress long-duration polar transitions. Generated threshold-boundary tests are separate sensitivity checks, not untuned holdout evidence. Threshold disagreements are retained in the JSON.

## Terrain comparison with published maps

Not an exact reproduction: published map exact start epoch is unconfirmed; its LDEM_65S_240M differs from the adjusted LDEM_60S_240MPP_ADJ used here. No pass tolerance assigned to this contextual comparison.

| Site | Resolution effect, Sun (pp) | Observer-height effect, Sun (pp) | Remaining surface-model minus map (pp) |
|---|---:|---:|---:|
| im2-athena | 0.960 | 0.441 | 0.368 |
| im1-odysseus | -0.207 | 1.431 | -2.464 |
| connecting-ridge | -22.105 | 18.896 | -7.499 |
| illum-peak-1 | -21.812 | 15.668 | -0.209 |
| illum-peak-2 | -6.640 | 6.222 | -1.068 |
| illum-peak-3 | -10.153 | 9.348 | -1.563 |
| illum-peak-4 | -22.054 | 15.293 | -2.197 |
| illum-peak-5 | -54.081 | 15.492 | 2.245 |
| illum-peak-6 | -6.762 | 7.245 | 8.933 |
| polar-interior | -0.035 | 0.017 | -0.253 |
| polar-offset | -0.460 | 0.961 | 7.242 |
| polar-custom | -0.269 | 0.180 | 0.335 |
| polar-edge | 0.000 | 0.029 | 0.554 |

Each effect changes one factor with coordinates, dates and visibility rule held fixed. These effects are conditional on that experiment, not universal error corrections.

## Search and power

| Shortlist | Same top five as exhaustive 147-scenario reference | Cached runtime (ms) |
|---|---|---:|
| 12 | True | 57.7 |
| 24 | True | 50.6 |
| 48 | True | 114.0 |

Default-grid sampled search: 1519 scenarios in 536.4 ms with exact precomputed horizons available. This is local calculation time, excluding downloads and cold custom terrain requests.

Battery reference: separate Python midpoint integration with 20,000 subdivisions per segment. Acceptance: 0.02 Wh and 0.002 h; full case inputs and errors in JSON. This validates numerical ideal-storage behavior, not real spacecraft performance.

## Reproduce

Run `python scripts/fetch_sources.py`, then `python scripts/validate_validity.py` with Node on PATH. The six holdouts and budgets are frozen in `scripts/validity_cases.json`. Search profiles carry source and generator SHA-256 hashes. No corrected coefficients are fitted to the published maps.

## Limits

- Numerical checks are conditional on the DEM, interpolation and idealized hardware assumptions.
- Six geographic holdouts are not statistical or telemetry validation; the geographic cases were selected before this run.
- SPICE and Horizons share JPL ephemeris heritage. A second code path is not independent physical truth.
- The exhaustive search check covers only its specified 147 scenarios. No global optimum is established.
- The published-map experiment cannot establish physical error bounds with unmatched epochs and DEM realizations.

Threshold-boundary sensitivity: 2 cases disagree with the 1-minute reference when a target is placed at its exact computed value (regression-peak-5, regression-im2). These are deliberately constructed boundary tests; numerical agreement within budget does not guarantee a stable verdict exactly on a threshold.
