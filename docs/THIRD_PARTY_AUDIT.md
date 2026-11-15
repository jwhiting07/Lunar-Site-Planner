# Lunar Site Planner — materials and tools inventory

Reviewed November 15, 2026. Scope: the checkout at `087aa08`, the available GitHub `origin/main` snapshot at `d6d412b`, the existing `dist` output, dependency metadata, documented sources, and tools evidenced in the repository or project chat. The two revisions have identical package manifests and licenses. This is a disclosure inventory, not a legal clearance or a complete record of anyone's off-repository work.

## Copyrighted material and other third-party assets

| Material | Where and how it is used | License, attribution, or open question |
| --- | --- | --- |
| Project code and documentation | `src/`, `scripts/`, project documentation and original UI | The [project MIT license](../LICENSE) carries Jesse Whiting's 2026 copyright notice. Keep it with distributions of the project software. It does not grant rights to third-party materials. |
| React, React DOM, Scheduler, Three.js, KaTeX | Browser build. Three.js includes its OrbitControls and GLTFLoader modules; KaTeX includes code and styles. | MIT as recorded in the lockfile and installed licenses. The full notices now ship in [`public/THIRD_PARTY_NOTICES.txt`](../public/THIRD_PARTY_NOTICES.txt). The [KaTeX code license](https://raw.githubusercontent.com/KaTeX/KaTeX/v0.19.1/LICENSE) is separate from its font license. |
| Inter variable Latin webfont | `public/fonts/inter-latin-variable.woff2`; the saved HTML reference also requests Inter from Google Fonts. | SIL Open Font License 1.1. The copyright and license are already shipped as [`public/fonts/OFL.txt`](../public/fonts/OFL.txt). [Upstream notice](https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt). |
| KaTeX math webfonts | The production build emits AMS, Caligraphic, Fraktur, Main, Math, SansSerif, Script, Typewriter, and Size1–Size4 in TTF, WOFF and WOFF2. | SIL Open Font License 1.1, separate from KaTeX's MIT license. The installed TTF metadata credits Design Science and Khan Academy. Their copyright and the OFL text are included in [`public/fonts/KaTeX-OFL.txt`](../public/fonts/KaTeX-OFL.txt) and in the combined notices. [KaTeX contributor clarification](https://github.com/KaTeX/KaTeX/issues/339). |
| NASA Goddard / LRO Moon model | `public/models/moon.glb`, from SVS `moon_small.glb`; the project downsized the embedded textures and changes the display lighting. | NASA SVS says its content is public domain unless marked otherwise. I found no separate restriction for this model on its source page. Preserve NASA SVS / Goddard / LRO credit and the record of modifications. [Model source and credits](https://svs.gsfc.nasa.gov/14959/), [SVS reuse policy](https://svs.gsfc.nasa.gov/help/), [NASA media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). |
| NASA SVS CGI Moon Kit | `public/textures/moon-color.jpg` comes from `lroc_color_2k.jpg`; the color map also supplies the nine `terrain_color_*.png` products. The downloaded `ldem_16_uint.tif` supplies global regional horizons. | Keep NASA's Scientific Visualization Studio and LRO instrument-team credit. The SVS reuse policy applies unless otherwise marked. [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), [SVS reuse policy](https://svs.gsfc.nasa.gov/help/). |
| NASA PGDA LOLA polar terrain and illumination | Downloaded `LDEM_60S_240MPP_ADJ.TIF`, `LDEM_80S_80MPP_ADJ.TIF`, `LDSM_80S_80MPP_ADJ.TIF`, `AVGVISIB_65S_240M_201608.TIF`, and other validation inputs listed by `scripts/fetch_sources.py`. Derived products include the terrain overview, site fields, nine terrain meshes, nine horizon masks and the upstream search horizon grid. | Cite Barker et al. (2023) for polar terrain and Mazarico et al. (2011) for illumination. The product pages request those citations. I did not verify a blanket license for unrelated PGDA or third-party products. [Terrain usage policy](https://pgda.gsfc.nasa.gov/products/90), [illumination citation](https://pgda.gsfc.nasa.gov/products/69). |
| NASA/JPL NAIF kernels and SPICE-derived data | Downloaded `de440s.bsp`, `moon_de440_250416.tf`, `moon_pa_de440_200625.bpc`, `naif0012.tls`, and `pck00011.tpc`. The site serves 70 derived yearly ephemeris binaries and two index files. JPL Horizons also supports offline validation. | The raw kernels are downloaded into the cache. NAIF permits redistribution of its unmodified kernels and has separate terms for toolkit redistribution. Credit NASA/JPL NAIF and DE440. The Horizons API has its own fair-use policy. [NAIF rules](https://naif.jpl.nasa.gov/naif/rules.html), [JPL API policy](https://ssd-api.jpl.nasa.gov/doc/index.php). |
| Yale Bright Star Catalog, Hoffleit and Warren (1991), via NASA HEASARC | `public/data/stars.json` contains 4,103 entries selected by magnitude with right ascension, declination and magnitude; the raw archive is an input to `scripts/prepare_stars.mjs`. | Credit Yale and NASA/GSFC HEASARC. I did not find a catalog-specific redistribution license on the catalog or CDS pages. Individual astronomical measurements are factual; compilation rights and applicable terms are a separate question. Confirm the extracted subset's reuse if public release requires a documented license. [HEASARC catalog](https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html), [CDS catalog](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/V/50?format=html&tex=true), [U.S. Copyright Office on facts and compilations](https://www.copyright.gov/help/faq/faq-protect.html). |
| Landing-site and scientific references | `public/data/landing_sites.json`, `scripts/*refs.json`, and [provenance](../public/data/provenance.json) credit 105 sources, including NASA/NSSDC/LROC/USGS, ESA, CNSA, ISRO, JAXA, commercial mission operators, papers and news coverage. The app uses facts such as coordinates and dates, source titles and links, and project-authored methods and notes. | I found references to external articles, papers and photos, but no tracked copies of those publications or their original photos beyond the separately listed NASA media. Preserve the citations. Rights in a source's text, illustrations or selection of material are separate from rights in individual facts. [U.S. Copyright Office](https://www.copyright.gov/help/faq/faq-general.html). |
| Historical concept art and project screenshots | The historical generated mockup is excluded from the current submission. `docs/ui/implemented-workspace.jpg` and the `output/ui/*.jpg` images are project screenshots. | The supplied concept references' ownership could not be independently verified. Credit underlying assets shown in screenshots. [Historical prompt record](ui/mockups/prompts-v1.md). |

The current file tree contained no separately vendored stock icon pack, music, video, NASA logo file, or commercial basemap. The repository history previously contained NASA Solar-view models and additional concept mockups removed from the current tree. This audit does not certify the rights of every previously deleted file or private design input.

## Tools and services used

| Area | Tools | Evidence and use |
| --- | --- | --- |
| AI coding and design | OpenAI ChatGPT / Codex; OpenAI ImageGen; Anthropic Claude Opus 5.5 | Codex is explicitly credited in the UI reference and verification log. The mockup prompt credits ImageGen. Git commit trailers record Claude co-authorship. None of these is a runtime dependency. |
| Development and version control | Git, GitHub, Windows PowerShell, Node.js, npm, Python 3.12.10, `venv`, pip | Git/GitHub for source and collaboration; PowerShell and the language runtimes/package managers for local development; Python 3.12.10 is recorded in the data build provenance. |
| Web app | TypeScript, React, React DOM, Three.js, KaTeX, browser WebGL, HTML/CSS and browser APIs | TypeScript/React for UI, Three.js/WebGL for the globe and markers, KaTeX for equations. Scheduler is a transitive browser dependency. Commander is installed through KaTeX for its CLI; the lockfile's runtime flag does not establish that it ships in the browser. |
| Build and verification | Vite, `@vitejs/plugin-react`, Vitest, TypeScript compiler, Babel, esbuild, Rollup, Google Chrome and Codex's in-app browser / Computer Use | Build/test scripts, npm lockfile, and verification records. Exact npm entries and license metadata appear below, including optional platform-specific dependencies. |
| Science and data preparation | NumPy, SpiceyPy and CSPICE N0067, Rasterio/GDAL, pyproj/PROJ, Requests, Pillow, pytest, Node's built-in fetch/filesystem/zlib/crypto | Python analysis, raster processing, map projection, downloading, image conversion and test suites; Node produces the star catalog subset and runs validation helpers. See [`requirements.txt`](../requirements.txt) and [pipeline provenance](../public/data/provenance.json). |
| External data and font services | NASA/JPL NAIF, JPL Horizons, NASA SVS, NASA PGDA/PDS, NASA HEASARC and Google Fonts | Sources, validation, or font delivery. Horizons is used in the validation scripts. NASA and other mission organizations credited for facts are listed in the provenance, not counted as SDKs. |

The UI reference mentions NASA.gov, Moon Trek, Worldview, NASA Eyes and Moonquake Map as design references, alongside Open MCT, NASA Horizon Design System, USWDS, Leaflet, uPlot, MMGIS and 3D Tiles Renderer as references or candidates. I did not find those libraries installed or bundled. The traceability notes identify Moonquake Map as visual inspiration and say its calculations were not copied. The references also document use of `curl` to check source availability. I could not verify tools used privately by collaborators that left no repository or chat record.

## Release checks

1. Ship the full MIT notices for the browser libraries and the KaTeX font OFL/copyright with the production build. Preserve Inter's included OFL and the project's MIT license. Inspect the deployed files as well as the local build.
2. Keep the NASA, Barker, Mazarico, NAIF and Yale/HEASARC attributions. Confirm the Yale-derived subset's redistribution status if explicit permission or a license is required for release.
3. Before rerunning live Horizons validation, replace the script's generic `validation-script` user-agent with an application-specific name, version and contact. The current [JPL policy](https://ssd-api.jpl.nasa.gov/doc/index.php) requests those fields for automated connections.
4. If distributing a Python environment rather than the existing browser output, inventory the exact deployed Python wheels and native libraries. The current requirements use version ranges and the local environment does not represent every possible installation.

## Downloaded science inputs

These inputs are fetched for the pipeline or validation. The repository generally tracks derived products instead of raw files. The model, color texture, and star catalog are listed in the materials table.

| File | Use | Source ID |
| --- | --- | --- |
| `naif0012.tls` | Leap-seconds kernel (UTC <-> TDB) | `R-NAIF-GK` |
| `pck00011.tpc` | Text PCK: body radii (Sun, Earth, Moon) | `R-NAIF-GK` |
| `de440s.bsp` | Planetary/lunar ephemeris DE440 (short span 1849-2150) | `R-DE440` |
| `moon_pa_de440_200625.bpc` | Binary PCK: lunar principal-axis orientation from DE440 | `R-DE440` |
| `moon_de440_250416.tf` | Lunar frame kernel: MOON_PA_DE440, MOON_ME_DE440_ME421 | `R-NAIF-MOONFK` |
| `de421.bsp` | DE421 ephemeris (validation only) | `R-DE421` |
| `moon_pa_de421_1900-2050.bpc` | DE421 lunar orientation (validation only) | `R-DE421` |
| `moon_080317.tf` | DE421 lunar frame kernel: MOON_PA_DE421, MOON_ME_DE421 (validation only) | `R-DE421` |
| `LDEM_80S_80MPP_ADJ.TIF` | LOLA DEM 80S-90S, 80 m/pix (near-field terrain, meshes, site elevation) | `R-LOLA-PGDA` |
| `LDEM_60S_240MPP_ADJ.TIF` | LOLA DEM 60S-90S, 240 m/pix (far-field terrain horizon) | `R-LOLA-PGDA` |
| `LDSM_80S_80MPP_ADJ.TIF` | LOLA slope map 80S-90S, 80 m/pix (site slope context) | `R-LOLA-PGDA` |
| `ldem_16_uint.tif` | Global LOLA at 16 pixels/degree (on-demand regional horizons) | `R-SVS-MOON-KIT` |
| `AVGVISIB_65S_240M_201608.TIF` | Average solar illumination 65S-90S, 240 m/pix, 18.6-yr mean (validation, site selection) | `R-MAZARICO-2011` |
| `AVGVISIB_65S_240M_201608_EARTH.TIF` | Average Earth visibility 65S-90S, 240 m/pix (validation only) | `R-MAZARICO-2011` |
| `AVGVISIB_65S_240M_201608.LBL` | PDS label describing the illumination map (validation only) | `R-MAZARICO-2011` |
| `AVGVISIB_65S_240M_201608_EARTH.LBL` | PDS label describing the Earth-visibility map (validation only) | `R-MAZARICO-2011` |

## npm dependency inventory

Every resolved package entry in `package-lock.json`, including optional platform variants. License values are package metadata, not a substitute for the actual license and bundled-component notices. “Runtime dependency” identifies the dependency graph, not the contents of the Vite bundle.

| Package | Version | Declared license | Dependency scope |
| --- | --- | --- | --- |
| `@babel/code-frame` | 7.29.7 | MIT | Development |
| `@babel/compat-data` | 7.29.7 | MIT | Development |
| `@babel/core` | 7.29.13 | MIT | Development |
| `@babel/generator` | 7.29.14 | MIT | Development |
| `@babel/helper-compilation-targets` | 7.29.13 | MIT | Development |
| `@babel/helper-globals` | 7.29.7 | MIT | Development |
| `@babel/helper-module-imports` | 7.29.7 | MIT | Development |
| `@babel/helper-module-transforms` | 7.29.14 | MIT | Development |
| `@babel/helper-plugin-utils` | 7.29.7 | MIT | Development |
| `@babel/helper-string-parser` | 7.29.14 | MIT | Development |
| `@babel/helper-validator-identifier` | 7.29.7 | MIT | Development |
| `@babel/helper-validator-option` | 7.29.7 | MIT | Development |
| `@babel/helpers` | 7.29.14 | MIT | Development |
| `@babel/parser` | 7.29.14 | MIT | Development |
| `@babel/plugin-transform-react-jsx-self` | 7.29.7 | MIT | Development |
| `@babel/plugin-transform-react-jsx-source` | 7.29.7 | MIT | Development |
| `@babel/template` | 7.29.7 | MIT | Development |
| `@babel/traverse` | 7.29.14 | MIT | Development |
| `@babel/types` | 7.29.14 | MIT | Development |
| `@esbuild/aix-ppc64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/android-arm` | 0.25.12 | MIT | Development, optional |
| `@esbuild/android-arm64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/android-x64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/darwin-arm64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/darwin-x64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/freebsd-arm64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/freebsd-x64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/linux-arm` | 0.25.12 | MIT | Development, optional |
| `@esbuild/linux-arm64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/linux-ia32` | 0.25.12 | MIT | Development, optional |
| `@esbuild/linux-loong64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/linux-mips64el` | 0.25.12 | MIT | Development, optional |
| `@esbuild/linux-ppc64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/linux-riscv64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/linux-s390x` | 0.25.12 | MIT | Development, optional |
| `@esbuild/linux-x64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/netbsd-arm64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/netbsd-x64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/openbsd-arm64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/openbsd-x64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/openharmony-arm64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/sunos-x64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/win32-arm64` | 0.25.12 | MIT | Development, optional |
| `@esbuild/win32-ia32` | 0.25.12 | MIT | Development, optional |
| `@esbuild/win32-x64` | 0.25.12 | MIT | Development, optional |
| `@jridgewell/gen-mapping` | 0.3.13 | MIT | Development |
| `@jridgewell/remapping` | 2.3.5 | MIT | Development |
| `@jridgewell/resolve-uri` | 3.1.3 | MIT | Development |
| `@jridgewell/sourcemap-codec` | 1.6.0 | MIT | Development |
| `@jridgewell/trace-mapping` | 0.3.31 | MIT | Development |
| `@rolldown/pluginutils` | 1.0.0-beta.27 | MIT | Development |
| `@rollup/rollup-android-arm-eabi` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-android-arm64` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-android-x64` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-darwin-arm64` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-darwin-x64` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-freebsd-arm64` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-freebsd-x64` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-linux-arm-gnueabihf` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-linux-arm-musleabihf` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-linux-arm64-gnu` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-linux-arm64-musl` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-linux-loong64-gnu` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-linux-loong64-musl` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-linux-ppc64-gnu` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-linux-ppc64-musl` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-linux-riscv64-gnu` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-linux-riscv64-musl` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-linux-s390x-gnu` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-linux-x64-gnu` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-linux-x64-musl` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-openbsd-x64` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-openharmony-arm64` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-win32-arm64-msvc` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-win32-ia32-msvc` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-win32-x64-gnu` | 4.68.3 | MIT | Development, optional |
| `@rollup/rollup-win32-x64-msvc` | 4.68.3 | MIT | Development, optional |
| `@tweenjs/tween.js` | 23.1.3 | MIT | Development |
| `@types/babel__core` | 7.20.5 | MIT | Development |
| `@types/babel__generator` | 7.27.0 | MIT | Development |
| `@types/babel__template` | 7.4.4 | MIT | Development |
| `@types/babel__traverse` | 7.28.0 | MIT | Development |
| `@types/chai` | 5.2.3 | MIT | Development |
| `@types/deep-eql` | 4.0.2 | MIT | Development |
| `@types/estree` | 1.0.10 | MIT | Development |
| `@types/katex` | 0.16.8 | MIT | Development |
| `@types/node` | 22.20.5 | MIT | Development |
| `@types/react` | 19.3.0 | MIT | Development |
| `@types/react-dom` | 19.3.0 | MIT | Development |
| `@types/stats.js` | 0.17.4 | MIT | Development |
| `@types/three` | 0.170.0 | MIT | Development |
| `@types/webxr` | 0.5.24 | MIT | Development |
| `@vitejs/plugin-react` | 4.7.0 | MIT | Development |
| `@vitest/expect` | 3.2.7 | MIT | Development |
| `@vitest/mocker` | 3.2.7 | MIT | Development |
| `@vitest/pretty-format` | 3.2.7 | MIT | Development |
| `@vitest/runner` | 3.2.7 | MIT | Development |
| `@vitest/snapshot` | 3.2.7 | MIT | Development |
| `@vitest/spy` | 3.2.7 | MIT | Development |
| `@vitest/utils` | 3.2.7 | MIT | Development |
| `@webgpu/types` | 0.1.74 | BSD-3-Clause | Development |
| `assertion-error` | 2.0.1 | MIT | Development |
| `baseline-browser-mapping` | 2.11.37 | Apache-2.0 | Development |
| `browserslist` | 4.29.5 | MIT | Development |
| `cac` | 6.7.14 | MIT | Development |
| `caniuse-lite` | 1.0.30001826 | CC-BY-4.0 | Development |
| `chai` | 5.3.3 | MIT | Development |
| `check-error` | 2.1.3 | MIT | Development |
| `commander` | 15.1.0 | MIT | Runtime dependency |
| `convert-source-map` | 2.0.0 | MIT | Development |
| `csstype` | 3.2.3 | MIT | Development |
| `debug` | 4.4.3 | MIT | Development |
| `deep-eql` | 5.0.2 | MIT | Development |
| `electron-to-chromium` | 1.5.485 | ISC | Development |
| `es-module-lexer` | 1.7.0 | MIT | Development |
| `esbuild` | 0.25.12 | MIT | Development |
| `escalade` | 3.2.0 | MIT | Development |
| `estree-walker` | 3.0.3 | MIT | Development |
| `expect-type` | 1.4.0 | Apache-2.0 | Development |
| `fdir` | 6.5.0 | MIT | Development |
| `fflate` | 0.8.3 | MIT | Development |
| `fsevents` | 2.3.3 | MIT | Development, optional |
| `gensync` | 1.0.0-beta.2 | MIT | Development |
| `js-tokens` | 4.0.0 | MIT | Development |
| `jsesc` | 3.1.0 | MIT | Development |
| `json5` | 2.2.3 | MIT | Development |
| `katex` | 0.19.1 | MIT | Runtime dependency |
| `loupe` | 3.2.1 | MIT | Development |
| `lru-cache` | 5.1.1 | ISC | Development |
| `magic-string` | 0.30.21 | MIT | Development |
| `meshoptimizer` | 0.18.1 | MIT | Development |
| `ms` | 2.1.3 | MIT | Development |
| `nanoid` | 3.3.20 | MIT | Development |
| `node-releases` | 2.0.64 | MIT | Development |
| `pathe` | 2.0.3 | MIT | Development |
| `pathval` | 2.0.1 | MIT | Development |
| `picocolors` | 1.1.1 | ISC | Development |
| `picomatch` | 4.0.7 | MIT | Development |
| `postcss` | 8.5.33 | MIT | Development |
| `react` | 19.3.1 | MIT | Runtime dependency |
| `react-dom` | 19.3.1 | MIT | Runtime dependency |
| `react-refresh` | 0.17.0 | MIT | Development |
| `rollup` | 4.68.3 | MIT | Development |
| `scheduler` | 0.28.0 | MIT | Runtime dependency |
| `semver` | 6.3.2 | ISC | Development |
| `siginfo` | 2.0.0 | ISC | Development |
| `source-map-js` | 1.2.2 | BSD-3-Clause | Development |
| `stackback` | 0.0.2 | MIT | Development |
| `std-env` | 3.10.0 | MIT | Development |
| `strip-literal` | 3.1.0 | MIT | Development |
| `strip-literal/node_modules/js-tokens` | 9.0.1 | MIT | Development |
| `three` | 0.170.0 | MIT | Runtime dependency |
| `tinybench` | 2.9.0 | MIT | Development |
| `tinyexec` | 0.3.2 | MIT | Development |
| `tinyglobby` | 0.2.17 | MIT | Development |
| `tinypool` | 1.1.1 | MIT | Development |
| `tinyrainbow` | 2.0.0 | MIT | Development |
| `tinyspy` | 4.0.6 | MIT | Development |
| `typescript` | 5.9.3 | Apache-2.0 | Development |
| `undici-types` | 6.21.0 | MIT | Development |
| `update-browserslist-db` | 1.3.4 | MIT | Development |
| `vite` | 6.4.6 | MIT | Development |
| `vite-node` | 3.2.4 | MIT | Development |
| `vitest` | 3.2.7 | MIT | Development |
| `why-is-node-running` | 2.3.0 | MIT | Development |
| `yallist` | 3.1.1 | ISC | Development |

## Python dependency inventory

Versions and license declarations from the local `.venv` metadata, except Pillow, which is declared and imported by the asset script but was absent from that environment snapshot. Native libraries can carry additional terms.

| Package | Version | Declared license |
| --- | --- | --- |
| `affine` | 3.0.1 | BSD-3-Clause |
| `attrs` | 26.1.0 | MIT |
| `certifi` | 2026.10.23 | Mozilla Public License 2.0 (MPL 2.0) |
| `charset-normalizer` | 3.5.2 | MIT |
| `click` | 8.5.1 | BSD-3-Clause |
| `colorama` | 0.4.6 | BSD License |
| `idna` | 3.20 | BSD-3-Clause |
| `iniconfig` | 2.3.1 | MIT |
| `numpy` | 2.5.4 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 |
| `packaging` | 26.3 | Apache-2.0 OR BSD-2-Clause |
| `pip` | 26.3 | MIT |
| `pluggy` | 1.7.0 | MIT License |
| `Pygments` | 2.21.0 | BSD-2-Clause |
| `pyparsing` | 3.3.3 | MIT |
| `pyproj` | 3.8.0 | MIT |
| `pytest` | 9.2.0 | MIT |
| `rasterio` | 1.5.2 | BSD-3-Clause |
| `requests` | 2.34.2 | Apache Software License |
| `spiceypy` | 8.4.0 | MIT |
| `urllib3` | 2.8.0 | MIT |
| `Pillow` | `>=11,<13` declared | [HPND / Pillow license](https://pillow.readthedocs.io/en/stable/about.html#license) |
