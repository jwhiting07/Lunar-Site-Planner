# References, data, conventions and assumptions

CLPS Lunar Mission Browser (NASA Space Apps 2026). This document is the
authoritative register of every external source, dataset, constant, convention,
formula, assumption and approximation used by the project. Companion documents:

- `docs/CALCULATION_TRACEABILITY.md`: dependency chain of every displayed or exported number.
- `docs/VALIDATION.md`: validation results V-1 ... V-8 (all measured error magnitudes are reported there, not here).
- `scripts/references.json`: machine-readable reference registry (single source of truth for reference IDs `R-...`), copied into `public/data/provenance.json` (`references`).
- `src/science/methods.ts`: method and assumption registry (IDs `M-...`, `A-...`) shown in the in-app "Sources & methods" panel.

All sources were accessed on **2026-11-14**. Where a bibliographic detail could not be checked it is marked **not verified**.

## Contents

1. [Scope, reading guide and classifications](#1-scope-reading-guide-and-classifications)
2. [Source registry](#2-source-registry)
3. [Datasets and kernels actually used](#3-datasets-and-kernels-actually-used)
4. [Conventions](#4-conventions)
5. [Constants and parameters](#5-constants-and-parameters)
6. [Classification of every quantity](#6-classification-of-every-quantity)
7. [Formulas](#7-formulas)
8. [Assumptions register](#8-assumptions-register)
9. [Approximations, limitations and error sources](#9-approximations-limitations-and-error-sources)
10. [Missing sources and unresolved items](#10-missing-sources-and-unresolved-items)

---

## 1. Scope, reading guide and classifications

The application compares three lunar south-polar locations over 2026-01-01T00:00Z to 2029-01-01T00:00Z (UTC): the Sun and Earth positions relative to the local terrain horizon, sunlight and geometric direct-to-Earth (DTE) line-of-sight windows, and an approximate solar-power and battery estimate for a generic lander with assumed parameters.

The pipeline has two stages:

- **Offline (Python, `scripts/`)**: `fetch_sources.py` downloads NASA files into `data_cache/` (git-ignored) and records SHA-256 checksums; `build_data.py` (with `moonlib.py`) computes hourly SPICE ephemeris samples, terrain horizon masks, terrain patches, site facts and a shaded-relief context map into `public/data/`, plus `provenance.json`.
- **Runtime (TypeScript, `src/science/`)**: interpolates the shipped samples and evaluates geometry, visibility, windows, power and battery. No network access other than loading `public/data/`.

Every quantity is placed in exactly one of four classes (the same four values as `Classification` in `src/science/methods.ts`):

| Class | Definition |
|---|---|
| **Directly sourced** (`sourced`) | Value taken from an external publication, standard or dataset without modification, or read (sampled) from a sourced grid at given coordinates. |
| **Computed** (`computed`) | Calculated by this project from sourced inputs with a stated formula (Section 7). |
| **Assumed** (`assumed`) | Model input chosen by this project (not from a source); configurable demonstration default. |
| **Approximated** (`approximated`) | Deliberate simplification of the physics or of the sampling, with its effect bounded or measured where possible (Section 9, `docs/VALIDATION.md`). |

---

## 2. Source registry

Roles: **computational input** = file read by the pipeline (listed in `provenance.json` `sources[].used_for`); **source value** = a number or coordinate copied from the source; **physical model**; **method** = algorithm or documentation of the tool; **validation** = used only to check results; **background** = context, not used in any calculation. "Verified" summarises how the entry was checked on 2026-11-14 (full text in `references.json`, field `verified`).

### 2.1 Ephemeris, frames, time, constants

| ID | Author / institution | Title | URL / DOI | Version / date | Relevant content | Use in project | Code | Role | Verified |
|---|---|---|---|---|---|---|---|---|---|
| R-NAIF-GK | NASA/JPL NAIF | SPICE generic kernels | https://naif.jpl.nasa.gov/naif/data_generic.html | files as in Section 3 | LSK, PCK, SPK, FK | download location of all kernels | `fetch_sources.py SOURCES` | computational input | HTTP 200 |
| R-DE440 | Park, R.S., Folkner, W.M., Williams, J.G., Boggs, D.H. (JPL) | The JPL Planetary and Lunar Ephemerides DE440 and DE441 | https://doi.org/10.3847/1538-3881/abd414 | AJ 161(3):105, 2021 | planetary/lunar ephemeris; DE440 PA to DE421 ME rotation (cited as [1] in the FK) | Sun, Earth, Moon positions and lunar orientation | `moonlib.py moon_centered_km`; `build_data.py build_ephemeris` | computational input | Crossref |
| R-DE421 | Folkner, W.M., Williams, J.G., Boggs, D.H. (JPL) | The Planetary and Lunar Ephemeris DE 421 | https://ipnpr.jpl.nasa.gov/progress_report/42-178/178C.pdf | IPN Progress Report 42-178, 2009-08-15 | DE421 ephemeris (frame of the LOLA products) | frame-consistency check only | validation scripts (V-3) | validation | PDF title page read |
| R-NAIF-MOONFK | NASA/JPL NAIF (N. Bachman) | Lunar frame kernel moon_de440_250416.tf | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf | created 2025-04-16 | frames MOON_PA_DE440 (31008), MOON_ME_DE440_ME421 (31009); stated accuracies (Section 4.1) | body-fixed frame of every vector | `moonlib.py ME_FRAME` | computational input | file comments read |
| R-NAIF-MOONFK-README | NASA/JPL NAIF | aareadme.txt (lunar FKs) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/aareadme.txt | rev. 2025-04-16 | FK/PCK pairing: moon_de440_250416.tf with moon_pa_de440_200625.bpc; moon_080317.tf with moon_pa_de421_1900-2050.bpc | kernel selection | `moonlib.py DE440_KERNELS` | method | HTTP 200, read |
| R-NAIF-LSK | NASA/JPL NAIF | Leapseconds kernel naif0012.tls | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls | last leap second 2017-01-01 (DELTA_AT = 37 s) | DELTET parameters | UTC to TDB | `build_data.py build_ephemeris` (`str2et`, `unitim`) | computational input | file read |
| R-NAIF-PCK | NASA/JPL NAIF (N. Bachman) | Planetary constants kernel pck00011.tpc | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc | 2022-12-27 | BODY10_RADII 695700 km; BODY399_RADII 6378.1366, 6378.1366, 6356.7519 km; BODY301_RADII 1737.4 km | solar/Earth/Moon radii; runtime check that PCK lunar radius = 1737.4 km | `build_data.py` line 215-236; `constants.ts R_SUN_KM, R_EARTH_KM` | computational input; source value | file read |
| R-IAU-WGCCRE | Archinal, B.A., Acton, C.H., A'Hearn, M.F., et al. (18 authors, IAU WGCCRE) | Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements: 2015 | https://doi.org/10.1007/s10569-017-9805-5 | CMDA 130(3), article 22, 2018 | lunar mean radius 1737.4 km; Moon ME system definition | upstream source of R_MOON | `constants.ts R_MOON_M`; `moonlib.py R_MOON_M` | source value | Crossref; radius confirmed via pck00011 comments ("unchanged in the 2015 IAU report") and R-USGS-LUNAR-STD; table number **not verified** (full text not retrievable) |
| R-NAIF-ABCORR | NASA/JPL NAIF (E. D. Wright) | Aberration Corrections Required Reading | https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/abcorr.html | rev. 2020-05-26 | definition of `LT+S`; recommended for apparent directions | aberration correction choice | `moonlib.py ABCORR` | method | HTTP 200, read |
| R-NAIF-SPKPOS | NASA/JPL NAIF | spkpos_c | https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/spkpos_c.html | routine v3.0.2, 2021-11-01 | target position relative to observer body | ephemeris samples | `moonlib.py moon_centered_km` | method | HTTP 200 |
| R-NAIF-SPKCPO | NASA/JPL NAIF | spkcpo_c | https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/spkcpo_c.html | routine v1.0.2, 2021-08-05 | state relative to an observer at constant position in a frame (`refloc = OBSERVER`) | surface-observer reference for V-2 | `moonlib.py topocentric_exact_km` | method; validation | HTTP 200, read |
| R-NAIF-FRAMES | NASA/JPL NAIF (N. J. Bachman) | Frames Required Reading | https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/frames.html | rev. 2021-12-31 | frame system, TK/PCK frames | frame handling | `moonlib.py` | method | HTTP 200 |
| R-NAIF-TIME | NASA/JPL NAIF (B. V. Semenov) | Time Required Reading | https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/time.html | rev. 2021-12-23 | UTC, TAI, TDB, leap seconds | time conversion | `build_data.py build_ephemeris` | method | HTTP 200 |
| R-SPICE | Acton, C.H. | Ancillary data services of NASA's Navigation and Ancillary Information Facility | https://doi.org/10.1016/0032-0633(95)00107-7 | PSS 44(1), 65-70, 1996 | SPICE system | software citation | all SPICE calls | method | Crossref |
| R-SPICE-2018 | Acton, C., Bachman, N., Semenov, B., Wright, E. | A look towards the future in the handling of space science mission geometry | https://doi.org/10.1016/j.pss.2017.02.013 | PSS 150, 9-12, 2018 | SPICE system | software citation | all SPICE calls | method | Crossref |
| R-SPICEYPY | Annex, A.M., Pearson, B., Seignovert, B., et al. (15 authors) | SpiceyPy: a Pythonic Wrapper for the SPICE Toolkit | https://doi.org/10.21105/joss.02050 | JOSS 5(46), 2050, 2020; used: spiceypy 8.4.0, CSPICE N0067 | Python SPICE interface | all SPICE calls | `moonlib.py` | method | Crossref |
| R-HORIZONS | NASA/JPL Solar System Dynamics | Horizons On-Line Ephemeris System and API | https://ssd-api.jpl.nasa.gov/doc/horizons.html | API responses report version 1.2 (doc page: 1.3, 2025-06); source DE441; lunar site frame MEAN_ME, radius 1737.4 km | independent topocentric az/el | validation only (V-1) | validation scripts | validation | test query 2026-11-14 |
| R-TSI | Prsa, A., Harmanec, P., Torres, G., Mamajek, E., et al. (IAU) | Nominal Values for Selected Solar and Planetary Quantities: IAU 2015 Resolution B3 | https://doi.org/10.3847/0004-6256/152/2/41 | AJ 152(2):41, 2016 | nominal S = 1361 W m^-2; nominal R_sun = 6.957e8 m | solar constant; solar radius | `constants.ts SOLAR_CONSTANT_W_M2, R_SUN_KM` | source value | Crossref; values read in arXiv:1510.07674 |
| R-TSI-MEAS | Kopp, G., Lean, J.L. | A new, lower value of total solar irradiance: Evidence and climate significance | https://doi.org/10.1029/2010GL045777 | GRL 38(1), L01706, 2011 | measured TSI 1360.8 +/- 0.5 W m^-2 (2008 minimum) | consistency of the adopted 1361 W m^-2 | `constants.ts` comment | validation | Crossref; value from abstract copies |
| R-AU | International Astronomical Union | IAU 2012 Resolution B2 on the re-definition of the astronomical unit of length | https://doi.org/10.1017/S1743921315005463 | Transactions IAU XXVIIIB (Proc. IAU 10(T28B)), Ch. IV, pp. 35-47 | 1 au = 149 597 870 700 m exactly | AU in inverse-square law | `constants.ts AU_KM` | source value | Crossref; resolution text read. Old iau.org PDF URL is broken (redirect loop to a login page) |

### 2.2 Terrain, illumination, cartography

| ID | Author / institution | Title | URL / DOI | Version / date | Relevant content | Use in project | Code | Role | Verified |
|---|---|---|---|---|---|---|---|---|---|
| R-LOLA-PGDA | Barker, M.K., Mazarico, E., Neumann, G.A., Smith, D.E., Zuber, M.T., Head, J.W., Sun, X. (NASA GSFC PGDA) | A New View of the Lunar South Pole from the Lunar Orbiter Laser Altimeter (LOLA); PGDA product 90 | https://pgda.gsfc.nasa.gov/products/90; paper https://doi.org/10.3847/PSJ/acf3e1; data https://doi.org/10.60903/gsfcpgda-lola-spole | PSJ 4(9):183, 2023 | LDEM_80S_80MPP_ADJ, LDEM_60S_240MPP_ADJ, LDSM_80S_80MPP_ADJ; south polar stereographic; frame "MOON_ME reference frame of the JPL DE421 ephemeris" (product page) | terrain heights, horizon masks, patches, site elevation, slope, overview map | `moonlib.py Dem, sample_terrain, compute_horizon`; `build_data.py` | computational input | Crossref; DataCite; product page |
| R-LOLA-SITES | Barker, M.K., Mazarico, E., Neumann, G.A., Smith, D.E., Zuber, M.T., Head, J.W. (NASA GSFC PGDA) | Improved LOLA elevation maps for south pole landing sites: Error estimates and their impact on illumination conditions; PGDA product 78 | https://pgda.gsfc.nasa.gov/products/78; https://doi.org/10.1016/j.pss.2020.105119 | PSS 203, 105119, 2021 | Site01 "Connecting ridge" 5 m DEM footprint x -19000..-3000 m, y -20000..-4000 m | search box for the connecting-ridge analysis point | `sites_input.json select.box_stereo_m`; `build_data.py select_site_point` | source value | Crossref; product page; GeoTIFF bounds read remotely |
| R-MAZARICO-2011 | Mazarico, E., Neumann, G.A., Smith, D.E., Zuber, M.T., Torrence, M.H. (NASA GSFC / MIT) | Illumination conditions of the lunar polar regions using LOLA topography; PGDA product 69 | https://pgda.gsfc.nasa.gov/products/69; https://doi.org/10.1016/j.icarus.2010.10.030 | Icarus 211(2), 1066-1081, 2011; maps V1.05 (2016-09-15) | average solar illumination and Earth visibility, 240 m/pix, hourly steps over ~18.6 years; "sunlit by any fraction of the solar disc" (PDS label) | (a) validation V-5; (b) used **once** to select the connecting-ridge analysis point | `build_data.py select_site_point` | validation; site selection | Crossref; product page; PDS labels |
| R-SNYDER | Snyder, J.P. (USGS) | Map Projections: A Working Manual | https://doi.org/10.3133/pp1395 | USGS Professional Paper 1395, 1987 | ch. 21, sphere, south polar aspect: (21-9) x, (21-10) y, (21-11) k, (21-12) rho, (20-12) theta, p. 158; inverse (20-14), (20-17), (20-18), (21-15), pp. 158-159 | stereographic forward/inverse | `moonlib.py stereo_south_forward/_inverse`; `geometry.ts stereoSouth/stereoSouthInverse` | method | Crossref; equations read in the USGS scan text layer |
| R-SEGMENT | Weisstein, E.W. (MathWorld) | Circular Segment | https://mathworld.wolfram.com/CircularSegment.html | n/a | segment area A = R^2 acos(r/R) - r sqrt(R^2 - r^2) (eq. 17) | visible fraction of the solar disk | `power.ts diskFractionVisible`; `moonlib.py disk_fraction_visible` | method | HTTP 200, read |
| R-USGS-LUNAR-STD | USGS Astrogeology, Planetary Spatial Data Infrastructure | Lunar Data Interoperability Standards | https://psdi.astrogeology.usgs.gov/moon/standards/data_standards/ | no date on page | vertical datum: 1737.4 km sphere; horizontal: DE421 rotated to ME, expected to shift to DE440 rotated to the DE421 ME frame | supports the frame/datum convention (Section 4) | none | background | HTTP 200, read |

### 2.3 Sites and missions

| ID | Author / institution | Title | URL | Date | Relevant content | Use | Code | Role | Verified |
|---|---|---|---|---|---|---|---|---|---|
| R-LROC-1360 | Robinson, M. (LROC, ASU) | Intuitive Machines IM-1 On The Moon! | https://lroc.im-ldi.com/images/1360 | 2024-02-26 | 80.13 S, 1.44 E, 2579 m elevation | IM-1 coordinates; published elevation (display only) | `sites_input.json` | source value | page read |
| R-NASA-IM1 | NASA (Goddard Digital Team) | NASA's LRO Images Intuitive Machine's Odysseus Lander | https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/ | 2024-02-26 | 80.13 S, 1.44 E, 2,579 m | second source for IM-1 | `sites_input.json` | source value | page read |
| R-LROC-1408 | Robinson, M. (LROC, ASU) | IM-2 Athena Seen Obliquely | https://lroc.im-ldi.com/images/1408 | 2025-03-10 | 84.7906 S, 29.1957 E; landed 2025-03-06; on its side in a 20 m crater; no elevation | IM-2 coordinates | `sites_input.json` | source value | page read |
| R-LROC-1401 | Robinson, M. (LROC, ASU) | IM-2 Landing Region | https://lroc.im-ldi.com/images/1401 | 2025-02-26 | intended site (-84.78, 29.13 E) | context only | none | background | page read |
| R-CLPS | NASA SMD | Commercial Lunar Payload Services (CLPS) Deliveries | https://science.nasa.gov/lunar-science/clps-deliveries/ | updated 2026-10-23 | TO2-IM to Malapert A (landed 2024-02-22); PRIME-1; CP-22 to Mons Mouton | mission context | none | background | page read |
| R-CP22 | NASA SMD | CLPS CP-22 Science | https://science.nasa.gov/lunar-science/clps-deliveries/cp-22-science/ | updated 2026-06-10 | "Intuitive Machines Nova-C lander (IM-4)" to Mons Mouton; **no coordinates** | context; why the IM-2 point is not a CP-22 target | none | background | page read |
| R-ARTEMIS3-REGIONS | NASA | NASA Provides Update on Artemis III Moon Landing Regions (24-136) | https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ | 2024-10-28 | nine regions incl. Mons Mouton, Mons Mouton Plateau; the connecting ridge is **not** listed | context | none | background | page read |
| R-USGS-GAZ-MOUTON | IAU / USGS Gazetteer of Planetary Nomenclature | Mons Mouton (feature 16070) | https://planetarynames.wr.usgs.gov/Feature/16070 | adopted 2022-05-13 | centre -84.60, 31.00 E; diameter 130 km | geographic context | none | background | page read |
| R-SVS-5027 | NASA SVS (E. Wright, N. Petro) | Illumination at the Moon's South Pole to 80S, 2025 to 2028 | https://svs.gsfc.nasa.gov/5027 | 2022-10-05 | visualisation from LOLA DEM and DE421 | context only | none | background | page read |
| R-SST-SOA-POWER | NASA Small Spacecraft Systems Virtual Institute | State-of-the-Art of Small Spacecraft Technology, 3.0 Power | https://www.nasa.gov/smallsat-institute/sst-soa/power-subsystems/ | page dated 2026-05-07 | Table 3-1: BOL efficiencies of space multi-junction cells (26.8-30.7 % for 3-junction products, up to 32.2 % for 4-5 junction/IMM) | plausibility of the assumed 28 % only | none | background | page read |
| R-CHALLENGE | NASA Space Apps Challenge | Lunar Landing Site Navigator (2026) | https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/ | 2026 | **not retrievable** (TLS certificate verification failure) | requirement list (team transcription) | none | background | **not verified** |

### 2.4 Use of the NASA resources suggested by the challenge

| Resource | Status in this project |
|---|---|
| NAIF SPICE kernels (DE440, lunar PCK/FK, LSK, PCK) | **computational input** |
| LOLA DEMs and slope map (PGDA product 90) | **computational input** |
| LOLA illumination / Earth-visibility maps (PGDA product 69) | **validation** (V-5); the solar map is additionally read **once** to select the connecting-ridge analysis point |
| JPL Horizons | **validation** only (V-1) |
| LROC posts, NASA IM-1 article | **source values** (landed coordinates) |
| CLPS / CP-22 pages, Artemis III regions release, SVS 5027 | **background** only |
| NASA Moon Trek | **not used** |
| LRO data products page | **not used** |

The challenge page itself could not be retrieved (Section 10). Requirements were taken from the team's transcription: select south-pole sites; select dates; geographic context; visualise Sun and Earth positions relative to the local horizon over time; terrain obstruction; sunlight availability; geometric direct-to-Earth communication windows; approximate solar power; compare sites; explain differences; export results. No other content of the challenge page is described here.

---

## 3. Datasets and kernels actually used

Retrieval dates and checksums are from `data_cache/sources_manifest.json` (copied into `provenance.json` `sources`). Total download of all files below: 797,407,757 bytes (about 0.80 GB, 0.74 GiB).

### 3.1 Computational inputs

| File | Institution | URL | Version / date | Bytes | SHA-256 | Retrieved (UTC) |
|---|---|---|---|---|---|---|
| de440s.bsp | NASA/JPL (NAIF) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp | DE440, short span | 32,726,016 | c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2 | 2026-11-14T17:49:11Z |
| moon_pa_de440_200625.bpc | NASA/JPL (NAIF) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc | DE440 lunar orientation | 12,863,488 | 60cd55aa401ea2ea97360636f567554bfe4e37bb829f901b4460a455dfaf783f | 2026-11-14T17:49:13Z |
| moon_de440_250416.tf | NASA/JPL (NAIF) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf | 2025-04-16 | 19,478 | a47c71e9c9f33796bdafb2c9d69a7ee447b6016ecad80f71cd6f3e479f9cf768 | 2026-11-14T17:49:14Z |
| naif0012.tls | NASA/JPL (NAIF) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls | naif0012 | 5,257 | 678e32bdb5a744117a467cd9601cd6b373f0e9bc9bbde1371d5eee39600a039b | 2026-11-14T17:49:07Z |
| pck00011.tpc | NASA/JPL (NAIF) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc | 2022-12-27 | 131,226 | 3dff7b1dbeceaa01f25467767d3fa25816051c85d162d1edf04acb310ee28bb1 | 2026-11-14T17:49:08Z |
| LDEM_80S_80MPP_ADJ.TIF | NASA GSFC PGDA | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF | PGDA product 90 (2023) | 189,158,392 | 82030dcbdd7c4bb0c7d858e9b4b293b9f2cda5a543ba31ec0f42784bd6beee5a | 2026-11-14T17:51:11Z |
| LDEM_60S_240MPP_ADJ.TIF | NASA GSFC PGDA | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_240MPP_ADJ.TIF | PGDA product 90 (2023) | 218,961,039 | 3f9663257b63022f2b0d5a623482ff3cadddceb91594a4e4ca14a94d8cec8b34 | 2026-11-14T17:53:18Z |
| LDSM_80S_80MPP_ADJ.TIF | NASA GSFC PGDA | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDSM_80S_80MPP_ADJ.TIF | PGDA product 90 (2023) | 241,594,035 | d1270c4a69d01a8e4eb5503bd25713f0b2251dbb4ffee6c3161ef7a792c8f059 | 2026-11-14T17:57:12Z |
| AVGVISIB_65S_240M_201608.TIF | NASA GSFC PGDA | https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_65S_240M_201608.TIF | V1.05, 2016-09-15 | 60,394,652 | 822fbf4618852311d4f494012e74e9cfb0147807a54ecb3302293c4266d2068d | 2026-11-14T17:58:07Z |

Coverage, frame, units and use:

| File | Coverage | Frame / projection / units / datum | How used | Limitations |
|---|---|---|---|---|
| de440s.bsp | 1849-12-26 to 2150-01-22 (TDB; read with `spkcov`); bodies 1-10, 199, 299, 301, 399 | ICRF (labelled J2000 in SPICE, see FK comments), km | `spkpos` of SUN and EARTH relative to MOON (M-EPHEM) | DE440 accuracy per R-DE440; not re-assessed here |
| moon_pa_de440_200625.bpc | 1549-12-31 to 2650-01-25 (TDB) | frame MOON_PA_DE440 (31008) relative to ICRF | lunar orientation for the ME frame | must be paired with moon_de440_250416.tf (R-NAIF-MOONFK-README) |
| moon_de440_250416.tf | n/a (constant rotation) | MOON_ME_DE440_ME421 (31009) = MOON_PA_DE440 rotated by `TKFRAME_31009_ANGLES = (67.8526, 78.6944, 0.2785)`, `AXES = (3, 2, 1)`, `UNITS = 'ARCSECONDS'`; the kernel states these angles and the axis sequence "represent the inverse of the cited rotation" of Park et al. 2021 ("angles are negated and the sequence is reversed") | body-fixed frame of all vectors | see Section 4.1 |
| naif0012.tls | leap seconds to 2017-01-01 (TAI-UTC = 37 s); TDB-TAI: DELTA_T_A = 32.184 s, K = 1.657e-3 s, EB = 1.671e-2 | n/a | UTC to TDB | future leap seconds unknown (Section 4.4) |
| pck00011.tpc | n/a | radii km: Sun 695700 ("Values are from the 2015 IAU report"; old 2009 value 696000); Earth 6378.1366/6378.1366/6356.7519; Moon 1737.4 ("unchanged in the 2015 IAU report"); primary source Archinal et al. 2018 | radii; build asserts PCK Moon radius = 1737.4 km | radii only; the PCK orientation data for the Moon (IAU_MOON) are not used |
| LDEM_80S_80MPP_ADJ.TIF | 7600 x 7600 px, x, y in [-304000, 304000] m (90 S to 80 S) | south polar stereographic on a 1737.4 km sphere (`Polar_Stereographic`, latitude of origin -90, central meridian 0, no false easting/northing; CRS "Moon (2015) - Sphere / Ocentric / South Polar", IAU:30135), true scale at the pole; float32 heights in m (GeoTIFF history: grid in km multiplied by 1000) above the 1737.4 km sphere; frame MOON_ME of DE421 (product page); `AREA_OR_POINT = Area`; height range -7295.5 to 7026.3 m | near-field terrain for the horizon, patch, site elevation, overview map | 80 m pixels; height reference stated by the CRS sphere and by R-MAZARICO-2011 / R-USGS-LUNAR-STD, not explicitly on the PGDA 90 page |
| LDEM_60S_240MPP_ADJ.TIF | 7760 x 7760 px, [-931200, 931200] m (90 S to 60 S) | as above; 240 m/pix; height range -9127.1 to 7024.8 m | far-field terrain (used where the 80 m DEM has no data) | 240 m pixels |
| LDSM_80S_80MPP_ADJ.TIF | as LDEM_80S | as above; float32 slope in degrees (range 0.0006 to 88.6) | site slope context (M-SLOPE) | slope over an 80 m baseline |
| AVGVISIB_65S_240M_201608.TIF | 6420 x 6420 px, [-770400, 770400] m (to about 55.2 S) | polar stereographic, 1737.4 km sphere, "MEAN EARTH/POLAR AXIS OF DE421" (PDS label); int16 DN, value = DN x 0.00004 ("SCALING_FACTOR"), 0 = permanent shadow to 1; computed from LDEM_65S_240M (label); hourly steps over ~18.6 years (product page) | maximum inside the R-LOLA-SITES Site01 box selects the connecting-ridge point (`select_site_point`); validation V-5 | 240 m; based on an older LOLA DEM than R-LOLA-PGDA; a long-term average, not the 2026-2028 interval |

### 3.2 Validation-only files (not used by any shipped value)

| File | URL | Bytes | SHA-256 | Retrieved (UTC) | Purpose |
|---|---|---|---|---|---|
| de421.bsp | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/a_old_versions/de421.bsp | 16,790,528 | 08b20db2ae22488650641c5a9033e5bfda4b1c4b440cfeaf20f621cfa18ecdb3 | 2026-11-14T17:49:16Z | V-3 (coverage 1899-07-29 to 2053-10-09 TDB) |
| moon_pa_de421_1900-2050.bpc | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de421_1900-2050.bpc | 1,770,496 | 656f90616403d75a75f0cd6c8830fc5b44f8cb4facb5ccb8915e752b397520cf | 2026-11-14T17:49:18Z | V-3 |
| moon_080317.tf | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_080317.tf | 21,437 | 78732477b96f9863e7b0d65bcee3c22b8707ca5ed0db56d1173319cb2e8c7993 | 2026-11-14T17:49:19Z | V-3 (frames MOON_PA_DE421, MOON_ME_DE421) |
| AVGVISIB_65S_240M_201608_EARTH.TIF | https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_65S_240M_201608_EARTH.TIF | 22,963,503 | 8a6d5fa8079c83e2159adf58ce33cd1cd9c09be6c19023bf5b6cc304f51568b7 | 2026-11-14T17:58:20Z | V-5; convention: visible "by any fraction of the Earth disc" (label), whereas this project uses Earth's centre |
| AVGVISIB_65S_240M_201608.LBL | http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/AVGVISIB_65S_240M_201608.LBL | 4,096 | 10b0d6d881713d6bd4d61a30cc64da6d53934e2c9a8cc702b36a5cd758751b03 | 2026-11-14T17:58:21Z | PDS label (describes the IMG version of the map) |
| AVGVISIB_65S_240M_201608_EARTH.LBL | http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/AVGVISIB_65S_240M_201608_EARTH.LBL | 4,114 | eb99d4e4a0bd3508e95dc87e0f65663452db0c20dcadaf272ebf27c7ce418913 | 2026-11-14T17:58:21Z | PDS label |

---

## 4. Conventions

### 4.1 Body-fixed frame: `MOON_ME_DE440_ME421`

- All Moon-fixed vectors (ephemeris samples, site positions, ENU bases) are in the SPICE frame `MOON_ME_DE440_ME421` [R-NAIF-MOONFK] (`moonlib.py ME_FRAME`; `ephemeris.json frame`).
- Reason: the LOLA DEMs are in "the MOON_ME reference frame of the JPL DE421 ephemeris" [R-LOLA-PGDA] and the illumination maps in the "MEAN EARTH/POLAR AXIS OF DE421" system [R-MAZARICO-2011, PDS label]. Coordinates, terrain and Sun/Earth directions must be in the same frame. USGS lunar standards specify DE421 ME and its continuation as "DE 440 ... rotated to the DE 421 ME frame" [R-USGS-LUNAR-STD].
- The frame kernel defines `MOON_ME_DE440_ME421` as a constant rotation from the DE440 principal-axis frame `MOON_PA_DE440` "such that the frame is closely aligned with the DE421 lunar mean Earth/polar axis frame"; the rotation is the one described in Park et al. 2021 as "from the DE440 PA frame to DE421 MER" [R-NAIF-MOONFK, R-DE440].
- Stated accuracy (FK comments): maximum rotation between `MOON_ME_DE421` and `MOON_ME_DE440_ME421` is 3.0709840342771e-7 rad (about 53.4 cm on the surface) for 2000-2040 and 5.8204420784597e-7 rad (slightly over 1 m) for 1900-2051. The project's own check is V-3.
- **Not used: `MOON_PA` / `MOON_PA_DE440`.** The FK states the DE440 ME-PA rotation angle is about 0.02886 deg, "approximately 875 m" on the surface. Mixing PA-frame Sun/Earth vectors with ME-frame LOLA coordinates would misplace the site by up to that amount and rotate the local axes accordingly.
- **Not used: `IAU_MOON`.** The FK states that for 2000-2040 the IAU_MOON ME realisation differs from the DE-based ME frame with an amplitude of about 0.0051 deg (about 155 m), mean about 0.00239 deg (about 72 m), because of the truncated libration series in the IAU formula. IAU_MOON is SPICE's default lunar body-fixed frame; the project names the frame explicitly in every call, so no frame-association kernel is needed.
- The generic alias `MOON_ME` (31001) points to `MOON_ME_DE440_ME421` in this FK; the code uses the explicit name so that a future FK re-pointing the alias cannot silently change results.
- Axes: +Z mean rotation pole (north), +X prime meridian containing the mean Earth direction (longitude 0), +Y longitude 90 E.

### 4.2 Coordinates, reference body, local frame

- Latitude: planetocentric, degrees; longitude: east-positive, degrees (sites stored in [0, 360) or (-180, 180]; formulas are periodic).
- Reference body: sphere of radius R = 1737.4 km [R-IAU-WGCCRE, R-NAIF-PCK, R-LOLA-PGDA GeoTIFF CRS]. DEM heights h are relative to this sphere; a surface point is at radius R + h.
- Observer ("eye") radius: r_o = R + h_site + h_obs, with h_site from the 80 m DEM and h_obs = 2 m [A-OBS-HEIGHT].
- Local frame: East-North-Up (ENU) at the site; Up = planetocentric radial unit vector (not the gravity vertical).
- Azimuth: clockwise from north, [0, 360) deg. Elevation: angle above the local horizontal plane (plane normal to Up through the observer), deg. Horizon elevation H(A) uses the same convention, so negative values mean terrain below the horizontal plane.
- Map projection: south polar stereographic on the 1737.4 km sphere, true scale at the pole, central meridian 0; +y toward longitude 0, +x toward 90 E [R-SNYDER]. The project's analytic formulas are checked against PROJ at build time (`check_dem_crs`; recorded maximum disagreement 1.6e-10 m in `provenance.json self_checks`).

### 4.3 Aberration correction and observer

- `LT+S` (one-way light time plus stellar aberration) [R-NAIF-ABCORR], observer = Moon centre (`spkpos(target, et, MOON_ME_DE440_ME421, "LT+S", "MOON")`) [R-NAIF-SPKPOS].
- The site-relative vector is formed at runtime as v = r_body(t) - r_obs, where r_body is the apparent Moon-centred vector and r_obs the site position (km). Light time and aberration are therefore evaluated for the Moon centre, not the surface point (approximation; magnitude in V-2, reference computed with `spkcpo` [R-NAIF-SPKCPO]).
- No refraction (airless body).

### 4.4 Time systems

- App and data files: UTC. Runtime times are JavaScript milliseconds since 1970-01-01T00:00:00Z.
- SPICE: ephemeris time TDB (seconds past J2000 TDB), from UTC via `str2et` with naif0012.tls [R-NAIF-LSK, R-NAIF-TIME].
- Sampling: uniform 3600 s steps in TAI from 2026-01-01T00:00:00 UTC; each converted to TDB with `unitim` (TDB - TAI has a periodic term of amplitude K = 1.657 ms in the LSK). Because naif0012 has no leap second after 2017-01-01, uniform TAI steps are uniform UTC steps through 2029-01-01, which `build_data.py` asserts.
- Future leap seconds: if a leap second is introduced after naif0012 (none is known to the kernel), UTC labels after it would be offset by 1 s per leap second. Horizons treats future intervals the same way (it uses the last known leap second as constant [R-HORIZONS, output notes]).

### 4.5 Units and conversions

| Quantity | Unit | Where converted |
|---|---|---|
| SPICE vectors, distances to Sun/Earth | km | `moonlib.moon_centered_km`; `ephemeris_<year>.bin` |
| Site position for vector subtraction | km | `geometry.ts sitePositionKm` (radius m / 1000); `moonlib.site_position_km` |
| Terrain heights, distances along rays, patch offsets | m | DEM values; `moonlib.compute_horizon`; `geometry.ts terrainNodeEnu` |
| Angles in formulas | rad internally, deg in data and UI | `DEG = pi / 180` (`constants.ts`, `moonlib.py`) |
| Irradiance, power, energy | W m^-2, W, Wh (kWh in summary rows) | `power.ts`; `summary.ts` divides Wh by 1000 |
| Time | ms (runtime), s (SPICE), h (durations) | `HOUR_MS = 3,600,000` |

---

## 5. Constants and parameters

Every numeric constant or parameter in the scientific code. Line numbers refer to the files at the time of writing.

| Name | Value | Units | Class | Source / ID | Code location |
|---|---|---|---|---|---|
| R_MOON (reference sphere) | 1,737,400 | m | sourced | R-IAU-WGCCRE, R-NAIF-PCK, R-LOLA-PGDA (CRS) | `constants.ts:11 R_MOON_M`; `moonlib.py:31`; asserted vs DEM CRS (`build_data.py:75`) and PCK (`build_data.py:236`) |
| R_SUN | 695,700 | km | sourced | R-NAIF-PCK BODY10_RADII = R-TSI nominal 6.957e8 m | `constants.ts:14`; `scripts/vcommon.py:24` |
| R_EARTH (equatorial) | 6378.1366 | km | sourced | R-NAIF-PCK BODY399_RADII | `constants.ts:17` (defined; not used by any runtime calculation at the time of writing) |
| AU | 149,597,870.7 | km | sourced (exact) | R-AU | `constants.ts:20` |
| Solar constant S0 | 1361 | W m^-2 | sourced | R-TSI (consistent with R-TSI-MEAS 1360.8 +/- 0.5) | `constants.ts:26` |
| DEG | pi / 180 | rad/deg | mathematical | - | `constants.ts:28`; `moonlib.py:41` |
| HOUR_MS | 3,600,000 | ms | definition | - | `constants.ts:29` |
| Body-fixed frame | `MOON_ME_DE440_ME421` | - | sourced (convention) | R-NAIF-MOONFK | `moonlib.py:35` |
| Aberration correction | `LT+S` | - | approximated (Moon-centre observer) | R-NAIF-ABCORR | `moonlib.py:39` |
| Ephemeris interval | 2026-01-01T00:00:00 to 2029-01-01T00:00:00 | UTC | assumed (scope) | - | `build_data.py:51` |
| Ephemeris step | 3600 | s | approximated | M-EPHEM | `build_data.py:51`; default analysis step `analysis.ts:241` |
| Observer height h_obs | 2.0 | m | assumed | A-OBS-HEIGHT | `build_data.py:39` |
| Horizon azimuth step | 0.5 (720 azimuths) | deg | approximated | M-HORIZON | `build_data.py:41` |
| Ray first sample / min step / relative step / max range | 40 / 40 / 0.001 / 600,000 | m / m / - / m | approximated | M-HORIZON | `build_data.py:43`; `moonlib.py:205 ray_distances_m` |
| Unseen-terrain bound height | 11,000 | m | assumed (bound only) | A-HMAX; build asserts max DEM height (7026 m) < 11,000 m | `build_data.py:47` |
| Terrain patch | 201 x 201 nodes, half-width 20,000 m (200 m spacing) | - , m | approximated (display) | M-PATCH | `build_data.py:49` |
| Overview map | 760 px, 10 x 10 block mean of the 80 m DEM = 800 m/px | px, m | display only | - | `build_data.py:52, 142-157` |
| Overview hillshade | vertical exaggeration 2, light azimuth 315 deg, altitude 35 deg, grey = clip(40 + 200 shade) | - | display only (artificial light) | - | `build_data.py:153-157` |
| Lander array area | 2.0 | m^2 | assumed | A-LANDER | `constants.ts:54` |
| Array efficiency | 0.28 | - | assumed | A-LANDER (plausibility: R-SST-SOA-POWER) | `constants.ts:55` |
| Load | 150 | W | assumed | A-LANDER | `constants.ts:56` |
| Battery capacity | 1500 | Wh | assumed | A-LANDER | `constants.ts:57` |
| Panel mode default | `tracking` | - | assumed | A-LANDER / M-POWER | `constants.ts:58` |
| Initial state of charge | 1.0 | fraction | assumed | A-BATT-INIT | `constants.ts:62` |
| Earth minimum clearance | 0 | deg | assumed | A-DTE-MASK | `constants.ts:68` |
| LSK TDB parameters | DELTA_T_A 32.184 s, K 1.657e-3 s, EB 1.671e-2, M = (6.239996, 1.99096871e-7) | s, -, rad, rad/s | sourced | R-NAIF-LSK | inside SPICE |
| Illumination map scale | 0.00004 per DN | - | sourced | R-MAZARICO-2011 (PDS label) | read via rasterio in `select_site_point` (recorded in `sites.json selection`) |
| Build self-check tolerances | projection forward < 1e-3 m, inverse < 1e-9 deg; interpolation check 4000 random hours x {15, 30, 45} min; RNG seeds 1 and 7 | - | test parameters | - | `build_data.py:78-86, 199-213` |
| Moon model lighting | ambient 0.45; directional intensity 2.6; overview viewing light or calculated Sun direction in local terrain | - | display only; no ray-traced shadows | - | `src/components/MoonView.tsx` |

---

## 6. Classification of every quantity

Each quantity appears once. IDs refer to `methods.ts`; references to Section 2.

### 6.1 Directly sourced

| Quantity | ID | Reference |
|---|---|---|
| IM-1 Odysseus latitude/longitude (-80.13, 1.44 E) | M-SITE | R-LROC-1360, R-NASA-IM1 |
| IM-1 published elevation 2579 m (displayed, not used in calculations) | M-SITE | R-LROC-1360, R-NASA-IM1 |
| IM-2 Athena latitude/longitude (-84.7906, 29.1957 E) | M-SITE | R-LROC-1408 |
| Site01 search box (x -19000..-3000 m, y -20000..-4000 m) | M-SITE | R-LOLA-SITES |
| Site elevation h_site (bilinear sample of the 80 m DEM at the site) | M-SITE | R-LOLA-PGDA |
| Site slope: pixel value and 3 x 3 mean of LDSM | M-SLOPE | R-LOLA-PGDA |
| Terrain heights (DEM samples feeding horizon, patch, overview) | M-HORIZON, M-PATCH | R-LOLA-PGDA |
| R_MOON, R_SUN, R_EARTH, AU, S0 | (constants) | R-IAU-WGCCRE, R-NAIF-PCK, R-TSI, R-AU |
| Body-fixed frame, aberration option, leap seconds | M-EPHEM | R-NAIF-MOONFK, R-NAIF-ABCORR, R-NAIF-LSK |
| Selection-map pixel value (0.93476 = 23369 x 0.00004) at the chosen ridge pixel | M-SITE | R-MAZARICO-2011 |

### 6.2 Computed

| Quantity | ID | Reference |
|---|---|---|
| Connecting-ridge analysis point (-89.445496, 222.686278 E) by the selection rule (rule itself: Section 8) | M-SITE | R-MAZARICO-2011, R-LOLA-SITES, R-SNYDER |
| Stereographic x, y of sites | M-SITE | R-SNYDER |
| Moon-centred Sun/Earth vectors (hourly samples) and their interpolation | M-EPHEM | R-DE440, R-NAIF-* |
| Observer position, ENU basis, azimuth, elevation, distance of Sun and Earth | M-GEOM | R-NAIF-FRAMES |
| Terrain horizon H(A), horizon distance, coverage, horizon min/max/mean, fraction of azimuths beyond patch, 240 m DEM sample fraction | M-HORIZON | R-LOLA-PGDA |
| Unseen-terrain margin (bound only) | A-HMAX | R-LOLA-PGDA |
| Sun/Earth centre clearance C = el - H(az) | M-SUNVIS, M-EARTHVIS | - |
| Solar angular radius, visible disk fraction, Sun visible flag | M-SUNVIS | R-NAIF-PCK, R-SEGMENT |
| Earth visible flag (geometric DTE), Earth above flat horizon | M-EARTHVIS | - |
| Windows, totals, fractions, longest darkness/blackout, both-visible | M-WINDOWS | - |
| Mean disk fraction, Sun/Earth elevation min/max, mean horizon toward Sun/Earth | M-SUNVIS, M-GEOM, M-HORIZON | - |
| Irradiance S(d), array power P | M-POWER | R-TSI, R-AU |
| Generated energy, unserved energy, deficit hours, curtailed energy, battery energy series, minimum battery % | M-BATTERY | - |
| Terrain patch heights and ENU node positions | M-PATCH | R-LOLA-PGDA |

### 6.3 Assumed

| Quantity | ID |
|---|---|
| Observer height 2 m | A-OBS-HEIGHT |
| Array area 2.0 m^2, efficiency 28 %, load 150 W, battery 1500 Wh, panel mode (default tracking) | A-LANDER |
| Load energy (= load x interval; shown as a summary row with kind `assumed`) | A-LANDER |
| Battery full at start | A-BATT-INIT |
| Earth minimum clearance 0 deg | A-DTE-MASK |
| Unseen-terrain height 11 km | A-HMAX |
| Ideal storage (100 % efficiency), constant load | M-BATTERY (assumption) |
| Connecting-ridge selection rule (maximum of the average-illumination map inside the Site01 box) | M-SITE (no separate ID) |
| Analysis interval and step chosen by the user (within 2026-2028, default step 1 h) | - |

### 6.4 Approximated

| Quantity | ID |
|---|---|
| Flat-horizon variants ("Sunlit time, flat horizon", "Earth visible, flat horizon": H = 0) | M-SUNVIS, M-EARTHVIS |
| Hourly ephemeris sampling with linear interpolation | M-EPHEM |
| Moon-centre light time and aberration | M-EPHEM |
| 0.5 deg azimuth table with linear interpolation; ray step rule; 600 km range | M-HORIZON |
| Uniform disk with straight, level horizon edge (no limb darkening) | M-SUNVIS |
| Earth treated as a point (centre) | M-EARTHVIS |
| Linear zero crossing of margins between samples | M-WINDOWS |
| Trapezoidal energy integration | M-BATTERY |
| Spherical reference body, radial "Up" | M-GEOM |
| Horizon distance read at the nearest table azimuth | M-HORIZON |
| Retained DEM grid limited to +/- 20 km with 200 m spacing; active local terrain uses the separate NASA Moon model with simple directional lighting | M-PATCH; `public/models/provenance.json` |

---

## 7. Formulas

Symbols: phi latitude, lambda east longitude, R = 1737.4 km, h height above the sphere, A azimuth, e elevation, t time. Identities are derived; models state their assumptions.

### 7.1 ENU basis (M-GEOM) - identity

Unit radial vector r(phi, lambda) = (cos phi cos lambda, cos phi sin lambda, sin phi).

- E = (dr/dlambda) / |dr/dlambda| = (-sin lambda, cos lambda, 0)
- N = dr/dphi = (-sin phi cos lambda, -sin phi sin lambda, cos phi)
- U = r

E x N = U (right-handed). Code: `geometry.ts enuBasis`, `moonlib.py enu_basis`.

### 7.2 Azimuth and elevation (M-GEOM) - identity

For an observer-to-target vector v (body-fixed): A = atan2(v.E, v.N) mod 360 deg, e = asin(v.U / |v|). Inverse (unit vector in ENU): (sin A cos e, cos A cos e, sin e). Code: `geometry.ts azEl, enuDirection`; `moonlib.py az_el_deg`.

Observer position: r_obs = (R + h_site + h_obs) U [km]; v = r_body(t) - r_obs. Code: `analysis.ts makeSiteContext, bodyState`.

### 7.3 Great-circle destination (M-HORIZON, M-PATCH) - identity

From (phi1, lambda1), initial azimuth A, arc s on the sphere R, delta = s / R:

- sin phi2 = sin phi1 cos delta + cos phi1 sin delta cos A
- lambda2 = lambda1 + atan2(sin A sin delta cos phi1, cos delta - sin phi1 sin phi2)

Spherical laws of cosines and sines. Code: `moonlib.py destination`.

### 7.4 Spherical south polar stereographic (M-SITE, M-HORIZON) - [R-SNYDER]

Forward (Snyder eqs. 21-9, 21-10, 21-12, with k0 = 1, lambda0 = 0): rho = 2R tan(pi/4 + phi/2); x = rho sin lambda; y = rho cos lambda. Point scale k = 2 / (1 - sin phi) (21-11), not used.

Inverse: rho = sqrt(x^2 + y^2) (20-18); c = 2 arctan(rho / 2R) (21-15); phi = arcsin(cos c sin phi1 + y sin c cos phi1 / rho) (20-14), which for phi1 = -90 deg reduces to phi = -(pi/2 - c); lambda = lambda0 + arctan(x / y) (20-17, south polar case), implemented as atan2(x, y). Code: `moonlib.py stereo_south_forward/_inverse`, `geometry.ts stereoSouth/stereoSouthInverse`. DEM pixel lookup: column = (x - x0)/dx - 0.5, row = (y - y0)/dy - 0.5, bilinear between the four neighbouring pixel centres (`moonlib.py Dem.sample_xy`).

### 7.5 Terrain elevation angle with curvature (M-HORIZON) - derived

Observer at radius r_o on the local Up axis; terrain sample at arc s along azimuth A, radius r_t = R + h(s), central angle theta = s / R. In the plane containing the Moon centre, the observer and the target, with the observer's horizontal axis toward A and vertical axis Up, the target is at (r_t sin theta, r_t cos theta) relative to the Moon centre and the observer at (0, r_o). The observer-to-target vector is (r_t sin theta, r_t cos theta - r_o), hence

    e(s) = atan2(r_t cos theta - r_o, r_t sin theta)

Exact on the sphere; no small-angle or "earth curvature correction" approximation. Code: `moonlib.py elevation_angle_deg`.

### 7.6 Horizon mask and interpolation (M-HORIZON)

- Ray samples: s_0 = 40 m, s_{k+1} = s_k + max(40 m, 0.001 s_k), up to 600 km (`ray_distances_m`).
- H(A_i) = max_k e(s_k) over samples before the first data gap; terrain from the 80 m DEM where it has data, else the 240 m DEM (`compute_horizon`, `sample_terrain`). The distance of the maximising sample is stored; coverage = distance of the last valid sample.
- Runtime interpolation (periodic, uniform table, step 0.5 deg): f = (A mod 360)/0.5, i = floor(f), w = f - i, H(A) = (1 - w) H_i + w H_{(i+1) mod 720} (`horizon.ts horizonAt`, `moonlib.py horizon_at`). Horizon distance: value at the nearest table azimuth (`horizonDistanceAt`).
- Unseen-terrain bound: e_max = e(s_cov) for r_t = R + 11 km (`unseen_terrain_bound_deg`); margin = min over A of H(A) - e_max (stored as `unseen_terrain_margin_min_deg`). A peak of fixed height subtends its largest elevation when it is closest, so placing it at the coverage limit bounds all farther terrain of at most that height.

### 7.7 Solar disk (M-SUNVIS)

- Apparent angular radius: rho_s = asin(R_sun / d), d = observer-to-Sun distance (km) (`analysis.ts sunAngularRadiusDeg`). For d between about 1.47e8 and 1.52e8 km this is about 0.26-0.27 deg.
- Centre clearance: C_s = e_s - H(A_s).
- Visibility (upper-limb criterion): visible if C_s + rho_s > 0, i.e. any part of the disk above the horizon (same convention as the PGDA illumination maps, "sunlit by any fraction of the solar disc").
- Visible fraction, derived: model the disk as a uniform circle of radius rho_s in the (azimuth, elevation) tangent plane, cut by a straight horizontal edge at distance C_s below the centre. For 0 <= C_s < rho_s the hidden part is a circular segment whose chord lies at distance r = C_s from the centre, area rho_s^2 acos(r/rho_s) - r sqrt(rho_s^2 - r^2) [R-SEGMENT eq. 17]. Dividing by pi rho_s^2 with x = C_s / rho_s:

      f = 1 - (acos x - x sqrt(1 - x^2)) / pi,   x clamped to [-1, 1]

  For C_s < 0 the visible part is the segment at distance |C_s|; substituting x = -y and acos(-y) = pi - acos(y) shows the same expression gives (acos y - y sqrt(1 - y^2))/pi, so one formula covers both cases; f = 0 for x <= -1 and 1 for x >= 1. Code: `power.ts diskFractionVisible`, `moonlib.py disk_fraction_visible`.

### 7.8 Earth visibility (M-EARTHVIS)

C_e = e_e - H(A_e); geometric DTE opportunity if C_e > C_min (default 0 deg, A-DTE-MASK). "Above flat horizon": e_e > 0. Earth is treated as its centre (apparent radius asin(6378 km / d) about 0.9-1.0 deg for d = 356,000-407,000 km).

### 7.9 Windows (M-WINDOWS)

Margins m(t): Sun m = C_s + rho_s; Earth m = C_e - C_min; flat variants use e instead of C. Between samples i, i+1 with opposite signs, the crossing is placed at the zero of the straight line through them:

    t_c = t_i + m_i / (m_i - m_{i+1}) (t_{i+1} - t_i)

A window open at the first sample is flagged `truncatedStart`; one still open at the last sample `truncatedEnd`. Darkness and blackout windows are complements within [start, end]; "both visible" is the intersection of Sun and Earth windows. Totals: sum of (end - start); fractions: total / interval length. Code: `windows.ts findWindows, complementWindows, intersectWindows, longestWindow`.

### 7.10 Irradiance, incidence and power (M-POWER)

- S(d) = S0 (1 au / d)^2 with S0 = 1361 W m^-2, d = observer-to-Sun distance (`solarFluxWm2`). Inverse-square law of a point source.
- Incidence factor cos i (Lambert cosine law): tracking = 1; vertical panel rotating in azimuth = cos e_s; horizontal panel = max(0, sin e_s) (`incidenceFactor`).
- P = S(d) A eta cos(i) f (`panelPowerW`), A and eta from A-LANDER, f from 7.7.

### 7.11 Battery energy balance (M-BATTERY)

For each step dt (h): E_gen = (P_i + P_{i+1})/2 dt (trapezoidal rule); E_load = P_load dt; n = E_gen - E_load; E' = E_i + n.

- If E' < 0: unserved += -E'; the battery is assumed to empty at a constant net rate, so the deficit time is (-E'/(-n)) dt and the first-deficit time is t_i + (1 - (-E')/(-n)) dt; E_{i+1} = 0.
- If E' > E_cap: curtailed += E' - E_cap; E_{i+1} = E_cap.
- Else E_{i+1} = E'. E_0 = E_cap x 1.0 (A-BATT-INIT). Minimum battery % = 100 min(E)/E_cap.

Generated energy is the sum of E_gen (including curtailed energy); load energy is the sum of E_load. Code: `power.ts simulateBattery`.

### 7.12 Time means (M-SUNVIS, M-HORIZON)

Trapezoidal time-weighted mean: mean(v) = sum 0.5 (v_i + v_{i+1})(t_{i+1} - t_i) / (t_end - t_0) (`analysis.ts timeMean`). Used for mean disk fraction and mean horizon toward the Sun/Earth (averaged over the whole interval, including times when the body is below the horizon).

### 7.13 Ephemeris interpolation (M-EPHEM)

r(t) = (1 - w) r_i + w r_{i+1}, w = (t - t_i)/step, never extrapolated (`ephemeris.ts bodyVectorKm`).

### 7.14 Terrain patch geometry (M-PATCH)

Node (i, j): east = -20 km + 200 m i, north = -20 km + 200 m j; arc s = hypot(east, north), azimuth atan2(east, north); height from 7.3 and the DEM. ENU position: horizontal = (R + h) sin(s/R) along the azimuth, up = (R + h) cos(s/R) - (R + h_site) (`geometry.ts terrainNodeEnu`, same derivation as 7.5).

### 7.15 Connecting-ridge site-selection rule (M-SITE)

Within the Site01 box [R-LOLA-SITES], take the 240 m pixel of AVGVISIB_65S_240M_201608 with the highest value (first maximum in raster order), use its pixel centre (x, y) and convert with 7.4 inverse. Selected pixel centre (-11400, -12360) m, raw DN 23369 (recorded in `sites.json selection`). Code: `build_data.py select_site_point`.

---

## 8. Assumptions register

All assumed values are **configurable demonstration defaults chosen by this project. They are not NASA, CLPS or vendor spacecraft specifications.** The energy results are only as meaningful as these inputs.

| ID | Value | Units | Justification | Plausibility reference | Change requires |
|---|---|---|---|---|---|
| A-OBS-HEIGHT | 2 | m | representative height of a lander's array/antenna reference point above the ground; avoids the eye sitting exactly on the DEM surface | none found | regenerating horizon masks (`build_data.py`) |
| A-LANDER area | 2.0 | m^2 | round number for a small solar-powered lander | none verified | UI parameter |
| A-LANDER efficiency | 0.28 | - | array-level sunlight-to-electric efficiency | R-SST-SOA-POWER lists beginning-of-life **cell** efficiencies of 26.8-30.7 % for 3-junction products. An array efficiency equal to a cell efficiency ignores packing factor, wiring, temperature and degradation losses, so 28 % for the whole array is at the optimistic end | UI parameter |
| A-LANDER load | 150 | W | constant electrical demand of a small lander | none verified (no load figure found in the NASA IM-1/IM-2 press kits) | UI parameter |
| A-LANDER battery | 1500 | Wh | usable energy storage | none verified | UI parameter |
| A-LANDER panel mode | tracking (default); vertical; horizontal | - | bracket the geometric extremes | - | UI parameter |
| A-BATT-INIT | 1.0 | fraction of capacity | neutral start | - | code constant |
| A-DTE-MASK | 0 | deg | pure geometric line of sight; real links need a mission-specific margin | - | UI parameter |
| A-HMAX | 11,000 | m | above the highest terrain in the DEMs used (7026 m); bound only, not used in any displayed value | R-LOLA-PGDA (DEM maximum) | `build_data.py` |
| Ideal storage | 100 % charge/discharge efficiency | - | simplest energy balance | - | code |
| Constant load | P_load constant in time | - | no operating modes, heaters or hibernation | - | code |
| Ridge selection rule | maximum average illumination in the Site01 box | - | reproducible, documented choice of a representative point; not a mission target | R-MAZARICO-2011, R-LOLA-SITES | `sites_input.json` |

No verifiable NASA or vendor figures for CLPS lander array area, load or battery capacity were found: the NASA IM-1 and IM-2 press kits contain none, and secondary sources (e.g. encyclopaedia entries) were not used.

---

## 9. Approximations, limitations and error sources

Measured magnitudes are in `docs/VALIDATION.md` (V-1 JPL Horizons, V-2 Moon-centre vs surface aberration, V-3 DE440-ME421 vs DE421 frame, V-4 interpolation, V-5 NASA illumination maps, V-6 horizon sampling convergence, V-7 site elevation/slope cross-check, V-8 test results). Values below are either recorded in shipped files or follow from stated geometry.

| Item | Effect | Magnitude / where measured |
|---|---|---|
| Hourly sampling of states | events shorter than 1 h between samples are missed; crossings placed by linear interpolation of the margin | V-4 |
| Linear interpolation of hourly vectors | direction and distance error between samples | build self-check recorded in `ephemeris.json interpolation.max_error_vs_spice`: Sun 1.54e-5 deg, Earth 1.33e-4 deg (direction), relative distance 9.9e-6 (Sun), 9.6e-7 (Earth); see V-4 |
| DEM resolution 80 m (near) / 240 m (far) | sub-pixel relief (boulders, small craters, the lander itself) absent; bilinear smoothing | V-6, V-7 |
| 0.5 deg azimuth sampling | narrow distant peaks between rays can be missed; linear interpolation between rays | V-6 |
| Ray step rule and 600 km range | step grows to 0.1 % of distance; terrain beyond 600 km bounded by A-HMAX margin (6.53-8.86 deg minimum margins per site in `sites.json`) | V-6; `sites.json horizon.unseen_terrain_margin_min_deg` |
| Flat-edge uniform solar disk | horizon assumed straight and level across the 0.53 deg disk, H read at the disk-centre azimuth; no limb darkening | not quantified |
| Earth as a point | Earth's disk radius about 0.9-1.0 deg; DTE windows refer to the centre; the PGDA Earth map counts any part of the disk | V-5 discusses the convention difference |
| Spherical body, radial Up | local gravity vertical and reference ellipsoid effects ignored | not quantified |
| Moon-centre aberration | light time and stellar aberration evaluated at the Moon centre | V-2 |
| Frame realisation | DE440-ME421 vs DE421 ME: FK states <= 53.4 cm (2000-2040) | FK comments; V-3 |
| Future leap seconds | 1 s per unannounced leap second after naif0012 | Section 4.4 |
| Representative points vs landing targets | the ridge point is a project choice; IM-2 point is a past landing, not the CP-22 target (no CP-22 coordinates published) | Section 10 |
| Rounded published coordinates | IM-1 to 0.01 deg (about 300 m in latitude on the 1737.4 km sphere) | `sites_input.json` note |
| Binary visibility | "visible" includes a sliver of the disk; the disk fraction is reported separately | - |
| Energy model | no thermal effects, degradation, dust, self-shadowing, reflected light, charge/discharge losses or operating modes | - |
| Geometric DTE is not a radio link | no antenna pattern, pointing, power, data rate, multipath or ground-station availability | - |
| Slope | 80 m-baseline context only; not a landing-hazard or safety assessment | V-7 |
| 3-D view | shows +/- 20 km only (horizon is often defined farther away; distance shown separately); lighting is a simple directional light and does not ray-trace shadows | - |
| Overview map | hillshade with a fixed artificial light; not an illumination state | - |

---

## 10. Missing sources and unresolved items

1. **Challenge page not retrievable**: https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/ failed TLS certificate verification from the build machine on 2026-11-14 (curl exit 60). Certificate checks were not bypassed. Requirements were taken from the team's transcription (Section 2.4).
2. **No published CP-22 coordinates**: R-CP22 names Mons Mouton and the Intuitive Machines Nova-C IM-4 lander but gives no coordinates or dates. The Mons Mouton site in the app is the IM-2 Athena as-landed point, not a CP-22 target.
3. **No published IM-2 elevation** was found (R-LROC-1408 gives coordinates only); `published_elevation_m` is null.
4. **IAU WGCCRE report table**: the 1737.4 km lunar radius is confirmed through pck00011.tpc and R-USGS-LUNAR-STD, but the report's own table could not be opened; its table number is not cited.
5. **R-AU URL**: the IAU's former PDF URL is broken; the reference now points to the resolution text in the Transactions of the IAU (Cambridge, DOI). The IAU archive mirror (iauarchive.eso.org) returned HTTP 502.
6. **R-TSI-MEAS article number** (L01706) and value were confirmed from abstract copies (NASA ESPO, DTIC) rather than the publisher page; Crossref confirms title, authors, volume and issue.
7. **Snyder equation numbers** were read from the OCR text layer of the USGS scan; the assignment of numbers to equations follows the printed order (x, y, k, rho, theta for the polar aspect).
8. **Height reference of the PGDA 90 DEMs**: the product page states heights in metres and the frame, but not the reference radius; the 1737.4 km sphere is stated by the GeoTIFF CRS, by the PGDA illumination page and by USGS lunar standards.
9. **Lander parameters**: no verifiable CLPS lander power, load or battery figures were found (Section 8).
10. **NASA data licensing**: the data providers' citation requests were verified (PGDA 90: cite Barker et al. 2023; PGDA 69: cite Mazarico et al. 2011; SVS: credit "NASA's Scientific Visualization Studio"). A general public-domain statement for these datasets was not verified from the source pages and is not asserted here.
