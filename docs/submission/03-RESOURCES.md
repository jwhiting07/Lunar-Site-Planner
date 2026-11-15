# Resources and tools for the submission form

Use each resource name as **Link Text** and its complete URL as **Link URL**. The tables identify how it was used. Include the individual catalogue and reference links in the appendix where applicable; the short list alone is not the entire project's source inventory.

## NASA Data — core entries

| Link Text | Link URL | Use / credit |
|---|---|---|
| NASA/JPL NAIF SPICE generic kernels, DE440 and lunar frames | https://naif.jpl.nasa.gov/naif/data_generic.html | Sun/Earth/Moon geometry, orientation, time and constants; unmodified source kernels cached locally |
| NASA GSFC PGDA — A New View of the Lunar South Pole from LOLA | https://pgda.gsfc.nasa.gov/products/90 | 80 m / 240 m elevation and slope products; Barker et al. 2023 |
| NASA GSFC PGDA — High-Resolution LOLA Topography for Lunar South Pole Sites | https://pgda.gsfc.nasa.gov/products/78 | Published site footprint context; Barker et al. 2021 |
| NASA GSFC PGDA — Lunar Polar Illumination | https://pgda.gsfc.nasa.gov/products/69 | Published solar/Earth visibility reference maps; Mazarico et al. 2011; validation and site selection |
| NASA/JPL Horizons API | https://ssd-api.jpl.nasa.gov/doc/horizons.html | Validation reference, not a live dependency of the browser app |
| NASA — Moon 3D Models for Web, AR, and Animation | https://svs.gsfc.nasa.gov/14959/ | Moon display model; credit NASA's Goddard Space Flight Center |
| NASA — CGI Moon Kit | https://svs.gsfc.nasa.gov/4720/ | Context color texture and global LOLA elevation input; credit NASA's Scientific Visualization Studio |
| Yale Bright Star Catalog hosted by NASA/GSFC HEASARC | https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html | Contextual starfield; Hoffleit and Warren 1991; catalogue authors retain their credit |
| NASA NSSDCA — Lunar Landing Sites | https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html | Mission catalogue facts; individual records and additional sources below |
| NASA/LROC — IM-1 location | https://lroc.im-ldi.com/images/1360 | Published as-landed coordinates; factual values, not a copied article image |
| NASA/LROC — IM-2 location | https://lroc.im-ldi.com/images/1408 | Published as-landed coordinates; factual values, not a copied article image |

## Space Agency Partner & Other Data — software and tools

| Link Text | Link URL | Use / licensing note |
|---|---|---|
| React and React DOM | https://react.dev/ | Interface; MIT |
| Three.js | https://threejs.org/ | 3D Moon, terrain and stars; MIT |
| KaTeX | https://katex.org/ | Mathematical notation and bundled fonts; MIT |
| TypeScript | https://www.typescriptlang.org/ | Application language and type checking; Apache-2.0 |
| Vite and React plugin | https://vite.dev/ | Build and local server; MIT |
| Vitest | https://vitest.dev/ | JavaScript/TypeScript tests; MIT |
| Node.js and npm | https://nodejs.org/ | JavaScript runtime and package installation; component terms apply |
| Python | https://www.python.org/ | Scientific preprocessing and custom terrain endpoint; PSF license |
| NumPy | https://numpy.org/ | Numerical arrays; BSD-3-Clause plus bundled-component terms |
| SpiceyPy | https://spiceypy.readthedocs.io/ | SPICE Python interface; MIT; CSPICE has separate NAIF terms |
| Rasterio | https://rasterio.readthedocs.io/ | Elevation raster access; BSD-3-Clause; GDAL and bundled components have separate terms |
| pyproj / PROJ | https://pyproj4.github.io/pyproj/ | Coordinate transforms; MIT plus bundled-component terms |
| Requests | https://requests.readthedocs.io/ | Source downloads; Apache-2.0 |
| Pillow | https://python-pillow.github.io/ | Image preparation; MIT-CMU plus bundled-component terms |
| pytest | https://docs.pytest.org/ | Python tests; MIT |
| Inter | https://github.com/rsms/inter | Interface font; SIL OFL 1.1 |
| Git | https://git-scm.com/ | Version control; GPL-2.0, tool use does not relicense project code |
| GitHub | https://github.com/ | Configured remote repository service; public access not yet verified |
| OpenAI Codex | https://openai.com/codex/ | SI code and documentation assistance |
| OpenAI image generation | https://openai.com/index/image-generation/ | Historical concept only; see SI disclosure and watermark requirement |

No SQL database, Firebase, Supabase, MongoDB, paid map API, or external database backend is referenced by the inspected implementation. It loads local JSON/binary products, uses browser localStorage for comparisons, and can call its own custom-terrain endpoint. NASA/partner archives are data sources, not database services that the team built or operates.

The NASA.gov, Moon Trek, Worldview, Open MCT, NASA Eyes and Horizon Design System links in `docs/ui/README.md` are design references. Leaflet, uPlot, MMGIS and 3D Tiles Renderer are suggested references there, **not installed dependencies or implemented tools**. Do not list them as software used. Design-reference links are included separately below for provenance.

## Complete source appendix

The current scientific provenance contains 105 reference records; two display-source records are added here. Duplicate URLs can be entered once while retaining all relevant uses. NASA-hosted resources go in NASA Data; partner-agency, USGS, publisher, commercial mission-provider, and other external links go in Space Agency Partner & Other Data. LROC source pages describe NASA LRO instrument products despite their non-NASA host. Journal citations can be entered under Other Data with the NASA dataset listed separately.

Original source-verification notes are preserved in `evidence/source-register.json`; they are historical evidence, not a claim that all pages were freshly opened or that all content on them is licensed for reproduction. Link reachability is recorded separately when `--check-links` is used.

| Form field | Reference ID | Link Text | Link URL | Role / provider |
|---|---|---|---|---|
| NASA Data | R-SVS-MOON-KIT | CGI Moon Kit | https://svs.gsfc.nasa.gov/4720/ | display color and regional horizon input; NASA Scientific Visualization Studio (Ernie Wright) |
| NASA Data | R-NAIF-GK | SPICE generic kernels (LSK, PCK, SPK, FK) | https://naif.jpl.nasa.gov/naif/data_generic.html | computational input; NASA/JPL Navigation and Ancillary Information Facility (NAIF) |
| Space Agency Partner & Other Data | R-DE440 | The JPL Planetary and Lunar Ephemerides DE440 and DE441 | https://doi.org/10.3847/1538-3881/abd414 | computational input; Park, R.S., Folkner, W.M., Williams, J.G., Boggs, D.H. (JPL) |
| NASA Data | R-DE421 | The Planetary and Lunar Ephemeris DE 421 | https://ipnpr.jpl.nasa.gov/progress_report/42-178/178C.pdf | validation; Folkner, W.M., Williams, J.G., Boggs, D.H. (JPL) |
| NASA Data | R-NAIF-MOONFK | Lunar frame kernel moon_de440_250416.tf (defines MOON_PA_DE440 and MOON_ME_DE440_ME421) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf | computational input; NASA/JPL NAIF (N. Bachman) |
| NASA Data | R-NAIF-MOONFK-README | aareadme.txt for lunar frame kernels (which FK pairs with which binary PCK) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/aareadme.txt | method; NASA/JPL NAIF |
| NASA Data | R-NAIF-LSK | Leapseconds kernel naif0012.tls | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls | computational input; NASA/JPL NAIF |
| NASA Data | R-NAIF-PCK | Planetary constants kernel pck00011.tpc (body radii) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc | computational input; source value; NASA/JPL NAIF (N. Bachman) |
| Space Agency Partner & Other Data | R-IAU-WGCCRE | Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements: 2015 | https://doi.org/10.1007/s10569-017-9805-5 | source value; Archinal, B.A., Acton, C.H., A'Hearn, M.F., Conrad, A., Consolmagno, G.J., Duxbury, T., Hestroffer, D., Hilton, J.L., Kirk, R.L., Klioner, S.A., McCarthy, D., Meech, K., Oberst, J., Ping, J., Seidelmann, P.K., Tholen, D.J., Thomas, P.C., Williams, I.P. (IAU WGCCRE) |
| NASA Data | R-NAIF-ABCORR | Aberration Corrections Required Reading (abcorr.req) | https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/abcorr.html | method; NASA/JPL NAIF (E. D. Wright) |
| NASA Data | R-NAIF-SPKPOS | spkpos_c API documentation (position of a target relative to an observer) | https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/spkpos_c.html | method; NASA/JPL NAIF |
| NASA Data | R-NAIF-SPKCPO | spkcpo_c API documentation (state of a target relative to an observer with constant position in a specified frame) | https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/spkcpo_c.html | method; validation; NASA/JPL NAIF |
| NASA Data | R-NAIF-FRAMES | Frames Required Reading (frames.req) | https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/frames.html | method; NASA/JPL NAIF (N. J. Bachman) |
| NASA Data | R-NAIF-TIME | Time Required Reading (time.req): UTC, TDB and leap seconds | https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/time.html | method; NASA/JPL NAIF (B. V. Semenov) |
| Space Agency Partner & Other Data | R-SPICE | Ancillary data services of NASA's Navigation and Ancillary Information Facility | https://doi.org/10.1016/0032-0633(95)00107-7 | method; Acton, C.H. |
| Space Agency Partner & Other Data | R-SPICE-2018 | A look towards the future in the handling of space science mission geometry | https://doi.org/10.1016/j.pss.2017.02.013 | method; Acton, C., Bachman, N., Semenov, B., Wright, E. |
| Space Agency Partner & Other Data | R-SPICEYPY | SpiceyPy: a Pythonic Wrapper for the SPICE Toolkit | https://doi.org/10.21105/joss.02050 | method; Annex, A.M., Pearson, B., Seignovert, B., Carcich, B.T., Eichhorn, H., Mapel, J.A., von Forstner, J.L.F., McAuliffe, J., del Rio, J.D., Berry, K.L., Aye, K.-M., Stefko, M., de Val-Borro, M., Kulumani, S., Murakami, S. |
| NASA Data | R-LOLA-PGDA | A New View of the Lunar South Pole from the Lunar Orbiter Laser Altimeter (LOLA); data: PGDA product 90 'A New View of the Lunar South Pole from LOLA' | https://pgda.gsfc.nasa.gov/products/90 | computational input; Barker, M.K., Mazarico, E., Neumann, G.A., Smith, D.E., Zuber, M.T., Head, J.W., Sun, X. (NASA GSFC Planetary Geodesy Data Archive) |
| NASA Data | R-LOLA-SITES | Improved LOLA elevation maps for south pole landing sites: Error estimates and their impact on illumination conditions; data: PGDA product 78 'High-Resolution LOLA Topography for Lunar South Pole Sites' | https://pgda.gsfc.nasa.gov/products/78 | source value (site footprint); Barker, M.K., Mazarico, E., Neumann, G.A., Smith, D.E., Zuber, M.T., Head, J.W. (NASA GSFC Planetary Geodesy Data Archive) |
| NASA Data | R-MAZARICO-2011 | Illumination conditions of the lunar polar regions using LOLA topography; data: PGDA product 69 'Lunar Polar Illumination' (maps AVGVISIB_65S_240M_201608, AVGVISIB_65S_240M_201608_EARTH) | https://pgda.gsfc.nasa.gov/products/69 | validation; site selection (connecting-ridge point); Mazarico, E., Neumann, G.A., Smith, D.E., Zuber, M.T., Torrence, M.H. (NASA GSFC / MIT) |
| NASA Data | R-LROC-1360 | Intuitive Machines IM-1 On The Moon! (landed coordinates of Odysseus: 80.13 S, 1.44 E, 2579 m elevation) | https://lroc.im-ldi.com/images/1360 | source value; Robinson, M. (LROC team, Arizona State University) |
| NASA Data | R-NASA-IM1 | NASA's LRO Images Intuitive Machine's Odysseus Lander (80.13 S, 1.44 E, 2,579 m) | https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/ | source value; NASA (Goddard Digital Team) |
| NASA Data | R-LROC-1408 | IM-2 Athena Seen Obliquely (landed coordinates of Athena: 84.7906 S, 29.1957 E; no elevation given) | https://lroc.im-ldi.com/images/1408 | source value; Robinson, M. (LROC team, Arizona State University) |
| NASA Data | R-LROC-1401 | IM-2 Landing Region (intended landing site -84.78, 29.13 E) | https://lroc.im-ldi.com/images/1401 | background; Robinson, M. (LROC team, Arizona State University) |
| NASA Data | R-CLPS | Commercial Lunar Payload Services (CLPS) Deliveries | https://science.nasa.gov/lunar-science/clps-deliveries/ | background; NASA Science Mission Directorate |
| NASA Data | R-CP22 | CLPS CP-22 Science (Intuitive Machines Nova-C lander IM-4 to Mons Mouton; no coordinates published) | https://science.nasa.gov/lunar-science/clps-deliveries/cp-22-science/ | background; NASA Science Mission Directorate |
| NASA Data | R-ARTEMIS3-REGIONS | NASA Provides Update on Artemis III Moon Landing Regions (release 24-136) | https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ | background; NASA |
| NASA Data | R-HORIZONS | Horizons On-Line Ephemeris System and API | https://ssd-api.jpl.nasa.gov/doc/horizons.html | validation; NASA/JPL Solar System Dynamics |
| NASA Data | R-SVS-5027 | Illumination at the Moon's South Pole to 80S, 2025 to 2028 | https://svs.gsfc.nasa.gov/5027 | background; NASA Scientific Visualization Studio (E. Wright, N. Petro) |
| Space Agency Partner & Other Data | R-TSI | Nominal Values for Selected Solar and Planetary Quantities: IAU 2015 Resolution B3 | https://doi.org/10.3847/0004-6256/152/2/41 | source value; Prsa, A., Harmanec, P., Torres, G., Mamajek, E., et al. (IAU Inter-Division A-G Working Group on Nominal Units for Stellar and Planetary Astronomy) |
| Space Agency Partner & Other Data | R-TSI-MEAS | A new, lower value of total solar irradiance: Evidence and climate significance | https://doi.org/10.1029/2010GL045777 | validation (consistency of the adopted solar constant); Kopp, G., Lean, J.L. |
| Space Agency Partner & Other Data | R-AU | IAU 2012 Resolution B2 on the re-definition of the astronomical unit of length (1 au = 149 597 870 700 m exactly) | https://doi.org/10.1017/S1743921315005463 | source value; International Astronomical Union |
| Space Agency Partner & Other Data | R-SNYDER | Map Projections: A Working Manual (ch. 21 Stereographic projection, sphere, polar aspect) | https://doi.org/10.3133/pp1395 | method; Snyder, J.P. (U.S. Geological Survey) |
| Space Agency Partner & Other Data | R-SEGMENT | Circular Segment | https://mathworld.wolfram.com/CircularSegment.html | method; Weisstein, E.W. (MathWorld, Wolfram Research) |
| Space Agency Partner & Other Data | R-USGS-LUNAR-STD | Lunar Data Interoperability Standards | https://psdi.astrogeology.usgs.gov/moon/standards/data_standards/ | background (supports the frame and datum conventions); U.S. Geological Survey Astrogeology Science Center, Planetary Spatial Data Infrastructure |
| Space Agency Partner & Other Data | R-USGS-GAZ-MOUTON | Mons Mouton (Moon), feature 16070 | https://planetarynames.wr.usgs.gov/Feature/16070 | background (geographic context only); IAU / USGS Gazetteer of Planetary Nomenclature |
| NASA Data | R-SST-SOA-POWER | State-of-the-Art of Small Spacecraft Technology, chapter 3.0 Power | https://www.nasa.gov/smallsat-institute/sst-soa/power-subsystems/ | background (plausibility of the assumed array efficiency only); NASA Small Spacecraft Systems Virtual Institute (S3VI) |
| Space Agency Partner & Other Data | R-CHALLENGE | Lunar Landing Site Navigator (2026 challenge statement) | https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/ | background; NASA Space Apps Challenge |
| NASA Data | R-LS-NSSDC-APOLLO | Apollo Landing Site Coordinates | https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html | catalogue coordinates (display and site selection); NASA NSSDCA (Goddard Space Flight Center), curator D. R. Williams |
| NASA Data | R-LS-NSSDC-IMPACTS | Table of Anthropogenic Impacts and Spacecraft on the Moon | https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html | catalogue coordinates (display and site selection); NASA NSSDCA (Goddard Space Flight Center), curator D. R. Williams |
| NASA Data | R-LS-LROC-2016 | Coordinates of Lunar Anthropogenic Targets (2016 LROC Coordinates of Robotic Spacecraft) | https://lroc.im-ldi.com/data/support/downloads/2016_LROC_Coordinates_of_Robotic_Spacecraft.pdf | catalogue coordinates (display and site selection); LROC Science Operations Team, Arizona State University (Wagner, Nelson, Plescia, Robinson, Speyerer, Mazarico) |
| NASA Data | R-LS-NSSDC-SURVEYOR | Surveyor (1966 - 1968) | https://nssdc.gsfc.nasa.gov/planetary/lunar/surveyor.html | catalogue coordinates (display and site selection); NASA NSSDCA (Goddard Space Flight Center), curator D. R. Williams |
| NASA Data | R-LS-SIDDIQI-2018 | Beyond Earth: A Chronicle of Deep Space Exploration, 1958-2016 | https://www.nasa.gov/wp-content/uploads/2018/09/beyond-earth-tagged.pdf | catalogue coordinates (display and site selection); NASA History Program Office (A. A. Siddiqi, NASA SP-2018-4041) |
| NASA Data | R-LS-NASA-HIST-LUNA2 | 60 Years Ago: Luna 2 Makes Impact in Moon Race | https://www.nasa.gov/history/60-years-ago-luna-2-makes-impact-in-moon-race/ | catalogue coordinates (display and site selection); NASA History (J. Uri) |
| NASA Data | R-LS-NSSDC-USSR | Soviet Missions to the Moon | https://nssdc.gsfc.nasa.gov/planetary/lunar/lunarussr.html | catalogue coordinates (display and site selection); NASA NSSDCA (Goddard Space Flight Center), curator D. R. Williams |
| NASA Data | R-LS-LROC-CE6 | First Look: Chang'e 6 | https://lroc.im-ldi.com/images/1374 | catalogue coordinates (display and site selection); LROC Science Operations Center (NASA LRO) |
| NASA Data | R-LS-LROC-CH3 | Chandrayaan-3 Landing Site | https://lroc.im-ldi.com/images/1314 | catalogue coordinates (display and site selection); LROC Science Operations Center (NASA LRO), M. Robinson |
| NASA Data | R-LS-NASA-CLPS-DELIVERIES | CLPS Deliveries | https://science.nasa.gov/lunar-science/clps-deliveries/ | catalogue coordinates (display and site selection); NASA Science Mission Directorate |
| NASA Data | R-LS-NASA-TO20A | TO20A: Astrobotic (CLPS delivery page) | https://science.nasa.gov/lunar-science/clps-deliveries/to20a-astrobotic/ | catalogue coordinates (display and site selection); NASA Science Mission Directorate |
| NASA Data | R-LS-NASA-CP11 | CP-11 (CLPS delivery page) | https://science.nasa.gov/lunar-science/clps-deliveries/cp-11/ | catalogue coordinates (display and site selection); NASA Science Mission Directorate |
| NASA Data | R-LS-NASA-CS11 | CS-11 (CLPS delivery page) | https://science.nasa.gov/lunar-science/clps-deliveries/cs-11/ | catalogue coordinates (display and site selection); NASA Science Mission Directorate |
| NASA Data | R-LS-NASA-CS3 | CS-3 (CLPS delivery page) | https://science.nasa.gov/lunar-science/clps-deliveries/cs-3/ | catalogue coordinates (display and site selection); NASA Science Mission Directorate |
| NASA Data | R-LS-NASA-CP21 | CP-21 Science (CLPS delivery page) | https://science.nasa.gov/lunar-science/clps-deliveries/cp-21-science/ | catalogue coordinates (display and site selection); NASA Science Mission Directorate |
| NASA Data | R-LS-NASA-CP22 | CP-22 Science (CLPS delivery page) | https://science.nasa.gov/lunar-science/clps-deliveries/cp-22-science/ | catalogue coordinates (display and site selection); NASA Science Mission Directorate |
| NASA Data | R-LS-NASA-IM4-EVENT | CLPS Flight: Intuitive Machines IM-4 (event page) | https://www.nasa.gov/event/clps-flight-intuitive-machines-im-4-2/ | catalogue coordinates (display and site selection); NASA |
| NASA Data | R-LS-NASA-CT3 | CT-3 Science (CLPS delivery page) | https://science.nasa.gov/lunar-science/clps-deliveries/ct-3-science/ | catalogue coordinates (display and site selection); NASA Science Mission Directorate |
| NASA Data | R-LS-NASA-CS6 | CS-6 Science (CLPS delivery page) | https://science.nasa.gov/lunar-science/programs/clps/cs-6-science/ | catalogue coordinates (display and site selection); NASA Science Mission Directorate |
| NASA Data | R-LS-NASA-VIPER | VIPER mission page | https://science.nasa.gov/mission/viper/ | catalogue coordinates (display and site selection); NASA Science Mission Directorate |
| NASA Data | R-LS-NASA-MOONBASE-PHASES | Moon Base phases | https://www.nasa.gov/moonbase-phases/ | catalogue coordinates (display and site selection); NASA |
| NASA Data | R-LS-NASA-REL26-046 | NASA Provides Update on Moon Base Rovers, Landers, Missions (RELEASE 26-046) | https://www.nasa.gov/news-release/nasa-provides-update-on-moon-base-rovers-landers-missions/ | catalogue coordinates (display and site selection); NASA |
| NASA Data | R-LS-NASA-REL24-136 | NASA Provides Update on Artemis III Moon Landing Regions (RELEASE 24-136) | https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ | catalogue coordinates (display and site selection); NASA |
| NASA Data | R-LS-NTRS-20250011660 | Artemis III Site Selection Update: Downselection From Thirteen to Nine Candidate Regions (LPSC 2026 abstract) | https://ntrs.nasa.gov/citations/20250011660 | catalogue coordinates (display and site selection); NASA (NTRS); George, Rubio, Lawrence, Curell |
| NASA Data | R-LS-NASA-ARTEMIS-III | Artemis III mission page | https://www.nasa.gov/mission/artemis-iii/ | catalogue coordinates (display and site selection); NASA |
| NASA Data | R-LS-NASA-ARTEMIS-IV | Artemis IV mission page | https://www.nasa.gov/mission/artemis-iv/ | catalogue coordinates (display and site selection); NASA |
| NASA Data | R-LS-NASA-APOLLO-TIMES | Apollo by the Numbers: LM Lunar Landing | https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_18-27_LM_Lunar_Landing.htm | catalogue UTC event times; NASA History Office |
| NASA Data | R-LS-NASA-SIVB-TIMES | Apollo by the Numbers: S-IVB Lunar Impact | https://www.nasa.gov/wp-content/uploads/2023/04/sp-4029.pdf | catalogue UTC event times; NASA History Office |
| NASA Data | R-LS-NSSDC-RANGER-TIMES | Ranger to the Moon | https://nssdc.gsfc.nasa.gov/planetary/lunar/ranger.html | catalogue UTC event times; NASA NSSDCA |
| NASA Data | R-LS-JPL-RANGER6-TIME | JPL Technical Report 32-694 | https://ntrs.nasa.gov/api/citations/19650003678/downloads/19650003678.pdf | catalogue UTC event times; NASA/JPL |
| NASA Data | R-LS-NASA-LUNA2-TIME | Summary of Hard and Soft Landers | https://ntrs.nasa.gov/api/citations/19680022029/downloads/19680022029.pdf | catalogue UTC event times; NASA |
| NASA Data | R-LS-NASA-LP-TIME | Lunar Prospector | https://science.nasa.gov/mission/lunar-prospector/ | catalogue UTC event times; NASA Science |
| NASA Data | R-LS-NASA-LCROSS-TIME | LCROSS Apache Point Observatory archive | https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=EAR-L-APO3.5M_AGILE-2-EDR-LCROSS-V1.0 | catalogue UTC event times; NASA Planetary Data System |
| Space Agency Partner & Other Data | R-LS-ESA-SMART1-TIME | ESA Annual Report 2006: Science | https://www.esa.int/esapub/annuals/annual06/ar6_activities.pdf | catalogue UTC event times; ESA |
| Space Agency Partner & Other Data | R-LS-CNSA-CE1-TIME | China's lunar probe Chang'e-1 impacts moon | https://www.cnsa.gov.cn/english/n6465652/n6465653/c6478763/content.html | catalogue UTC event times; CNSA |
| Space Agency Partner & Other Data | R-LS-CNSA-CE3-TIME | Chang'e 3 landing announcement | https://www.cnsa.gov.cn/n6758968/n6758972/c6798565/content.html | catalogue UTC event times; CNSA |
| Space Agency Partner & Other Data | R-LS-CNSA-CE4-TIME | China's Chang'e-4 probe makes historic landing on moon's far side | https://www.cnsa.gov.cn/english/n6465652/n6465653/c6805049/content.html | catalogue UTC event times; CNSA |
| Space Agency Partner & Other Data | R-LS-CNSA-CE5-TIME | Chang'e 5 landing announcement | https://www.cnsa.gov.cn/n6759533/c6810683/content.html | catalogue UTC event times; CNSA |
| Space Agency Partner & Other Data | R-LS-CNSA-CE6-TIME | China's Chang'e-6 lands on moon's far side to collect samples | https://www.cnsa.gov.cn/english/n6465652/n6465653/c10541840/content.html | catalogue UTC event times; CNSA |
| Space Agency Partner & Other Data | R-LS-ISRO-CH3-TIME | Chandrayaan-3 APXS overview | https://www.isro.gov.in/media_isro/pdf/APXS_CH3.pdf | catalogue UTC event times; ISRO |
| Space Agency Partner & Other Data | R-LS-JAXA-SLIM-TIME | SLIM mission archive | https://darts.isas.jaxa.jp/en/missions/slim | catalogue UTC event times; JAXA/ISAS |
| NASA Data | R-LS-NASA-IM1-TIME | NASA?s LRO Images Intuitive Machine?s Odysseus Lander | https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/ | catalogue UTC event times; NASA Goddard Space Flight Center |
| NASA Data | R-LS-NASA-IM2-TIME | MSolo PRIME-1 overview and results | https://ntrs.nasa.gov/api/citations/20260003150/downloads/MSolo%20PRIME-1%20overview%20and%20results%20-%20LSSW.pdf | catalogue UTC event times; NASA PRIME-1 team |
| NASA Data | R-LS-NASA-BGM1-TIME | Blue Ghost Lands on Moon | https://www.nasa.gov/image-article/blue-ghost-lands-on-moon/ | catalogue UTC event times; NASA |
| Space Agency Partner & Other Data | R-LS-JAXA-KAGUYA-TIME | KAGUYA Lunar Impact | https://www.kaguya.jaxa.jp/en/communication/KAGUYA_Lunar_Impact_e.htm | catalogue UTC event times; JAXA/SELENE |
| Space Agency Partner & Other Data | R-LS-GRAIL-LPSC-TIMES | LRO-LAMP Observations of the GRAIL Impacts | https://www.lpi.usra.edu/meetings/lpsc2013/pdf/3004.pdf | catalogue UTC event times; LRO LAMP and GRAIL teams |
| Space Agency Partner & Other Data | R-LS-SPACEIL-BERESHEET-TIME | The science mission of SpaceIL?s Beresheet lander | https://static1.squarespace.com/static/56d74e9c4c2f85996d16a562/t/5ff342080f9679460523c65e/1609777692371/Aharonson_2020_PSS.pdf | catalogue UTC event times; SpaceIL mission team (Aharonson et al.) |
| Space Agency Partner & Other Data | R-LS-FIREFLY-BGM2 | Blue Ghost Mission 2 (Riders 2 the Dark) | https://fireflyspace.com/blue-ghost-mission-2/ | catalogue coordinates (display and site selection); Firefly Aerospace |
| Space Agency Partner & Other Data | R-LS-FIREFLY-BGM3 | Blue Ghost Mission 3 | https://fireflyspace.com/missions/blue-ghost-mission-3/ | catalogue coordinates (display and site selection); Firefly Aerospace |
| Space Agency Partner & Other Data | R-LS-ISRO-LPSC2026-1198 | Identification and Characterisation of Potential Landing Sites on Lunar South Polar area for Chandrayaan-4 Mission using OHRC Images (57th LPSC 2026, abstract 1198) | https://www.hou.usra.edu/meetings/lpsc2026/pdf/1198.pdf | catalogue coordinates (display and site selection); Space Applications Centre (ISRO); Amitabh et al. |
| Space Agency Partner & Other Data | R-LS-PTI-THEPRINT-CH4 | ISRO identifies site for Chandrayaan-4 lander | https://theprint.in/india/isro-identifies-site-for-chandrayaan-4-lander/2850080 | catalogue coordinates (display and site selection); Press Trust of India (via ThePrint), quoting ISRO officials |
| Space Agency Partner & Other Data | R-LS-TPS-CHANGE7 | Chang'e-7: China's water-hunting lunar south pole mission | https://www.planetary.org/space-missions/change-7 | catalogue coordinates (display and site selection); The Planetary Society |
| Space Agency Partner & Other Data | R-LS-SCIAM-CHANGE7-DELAY | China delays ambitious Chang'e-7 Moon mission until 2027 | https://scientificamerican.com/article/china-delays-ambitious-change-7-moon-mission-until-2027 | catalogue coordinates (display and site selection); Scientific American |
| Space Agency Partner & Other Data | R-LS-ZHAO2025-CE7 | Selection of Landing Sites for the Chang'E-7 Mission Using Multi-Source Remote Sensing Data | https://ira.lib.polyu.edu.hk/bitstream/10397/117857/1/remotesensing-17-01121-v2.pdf | catalogue coordinates (display and site selection); Zhao et al., Remote Sensing 17(7):1121, doi:10.3390/rs17071121 (author copy at PolyU repository) |
| Space Agency Partner & Other Data | R-LS-XINHUA-CHANGE8 | Chang'e-8 announcement (Space Day 2025) | https://english.spacechina.com/n17212/c4320459/content.html | catalogue coordinates (display and site selection); Xinhua via China Aerospace Science and Technology Corp. (english.spacechina.com) |
| Space Agency Partner & Other Data | R-LS-ISPACE-ULTRA-20260327 | ispace-U.S. mission schedule updated due to engine development delays & model update (press release) | https://ispace-inc.com/wp-content/uploads/2026/03/20260327-ULTRA.pdf | catalogue coordinates (display and site selection); ispace, inc. |
| Space Agency Partner & Other Data | R-LS-USGS-16070 | Mons Mouton | https://planetarynames.wr.usgs.gov/Feature/16070 | catalogue coordinates (display and site selection); USGS / IAU Gazetteer of Planetary Nomenclature |
| Space Agency Partner & Other Data | R-LS-USGS-4987 | Reiner Gamma | https://planetarynames.wr.usgs.gov/Feature/4987 | catalogue coordinates (display and site selection); USGS / IAU Gazetteer of Planetary Nomenclature |
| Space Agency Partner & Other Data | R-LS-USGS-5381 | Schrödinger | https://planetarynames.wr.usgs.gov/Feature/5381 | catalogue coordinates (display and site selection); USGS / IAU Gazetteer of Planetary Nomenclature |
| Space Agency Partner & Other Data | R-LS-USGS-3982 | Mons Gruithuisen Gamma | https://planetarynames.wr.usgs.gov/Feature/3982 | catalogue coordinates (display and site selection); USGS / IAU Gazetteer of Planetary Nomenclature |
| Space Agency Partner & Other Data | R-LS-USGS-4159 | Nassau | https://planetarynames.wr.usgs.gov/Feature/4159 | catalogue coordinates (display and site selection); USGS / IAU Gazetteer of Planetary Nomenclature |
| Space Agency Partner & Other Data | R-LS-USGS-8058 | Cabeus B | https://planetarynames.wr.usgs.gov/Feature/8058 | catalogue coordinates (display and site selection); USGS / IAU Gazetteer of Planetary Nomenclature |
| Space Agency Partner & Other Data | R-LS-USGS-14502 | Haworth | https://planetarynames.wr.usgs.gov/Feature/14502 | catalogue coordinates (display and site selection); USGS / IAU Gazetteer of Planetary Nomenclature |
| Space Agency Partner & Other Data | R-LS-USGS-16338 | Mons Malapert | https://planetarynames.wr.usgs.gov/Feature/16338 | catalogue coordinates (display and site selection); USGS / IAU Gazetteer of Planetary Nomenclature |
| Space Agency Partner & Other Data | R-LS-USGS-4321 | Nobile | https://planetarynames.wr.usgs.gov/Feature/4321 | catalogue coordinates (display and site selection); USGS / IAU Gazetteer of Planetary Nomenclature |
| Space Agency Partner & Other Data | R-LS-USGS-1439 | de Gerlache | https://planetarynames.wr.usgs.gov/Feature/1439 | catalogue coordinates (display and site selection); USGS / IAU Gazetteer of Planetary Nomenclature |
| Space Agency Partner & Other Data | R-LS-USGS-5450 | Shackleton | https://planetarynames.wr.usgs.gov/Feature/5450 | catalogue coordinates (display and site selection); USGS / IAU Gazetteer of Planetary Nomenclature |
| NASA Data | DISPLAY-MOON-MODEL | Moon 3D Models for Web, AR, and Animation | https://svs.gsfc.nasa.gov/14959/ | display-only web-adapted Moon model; NASA's Goddard Space Flight Center |
| NASA Data | DISPLAY-STARS | Yale Bright Star Catalog, 5th Revised Edition (Preliminary) | https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html | display-only filtered star positions; Hoffleit and Warren (1991); NASA/GSFC HEASARC host |

## Public replacement for one broken source URL

The archived ESA annual-report section at `https://www.esa.int/esapub/annuals/annual06/ar6_activities.pdf` returned HTTP 404. For the submission, use [ESA — Impact landing ends Smart-1 Moon mission](https://www.esa.int/articles/about-us/directorates/science/smart-1/impact-landing-ends-smart-1-moon-mission). The ESA release independently confirms the recorded September 3, 2006 impact time of 05:42:22 UT. The original source registry above is retained as historical provenance; do not present the broken URL as freshly verified.

## Design references

- [NASA.gov](https://www.nasa.gov/) — interface inspiration; no assertion that its code/assets were copied.
- [Moon Trek](https://trek.nasa.gov/moon/) — interface inspiration; no assertion that its code/assets were copied.
- [NASA Worldview](https://worldview.earthdata.nasa.gov/) — interface inspiration; no assertion that its code/assets were copied.
- [Open MCT](https://nasa.github.io/openmct/) — interface inspiration; no assertion that its code/assets were copied.
- [NASA Eyes](https://eyes.nasa.gov/apps/solar-system/) — interface inspiration; no assertion that its code/assets were copied.
- [NASA Horizon Design System](https://github.com/nasa/hds-core) — interface inspiration; no assertion that its code/assets were copied.

## Exact dependency evidence

- `evidence/npm-inventory.json`: every lockfile package, installed version, declared license and located notices.
- `evidence/python-inventory.json`: installed Python distributions and their recorded licensing metadata; versions describe this environment, not a fully pinned requirements file.
- `../../../public/THIRD_PARTY_NOTICES.txt`: collected npm and Inter notices for distribution.
- `evidence/python-notices.txt`: collected Python license texts, including available bundled-component notices.
- Existing asset provenance records identify URLs, modifications and SHA-256 hashes.
