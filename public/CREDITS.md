# Project Seraphim / Lunar Site Planner credits

Project code is supplied under the repository's MIT license. External code, fonts and source data retain their providers' terms. This educational team project is not endorsed by NASA.

- **SPICE and DE440 geometry:** NASA/JPL NAIF; [generic kernels](https://naif.jpl.nasa.gov/naif/data_generic.html), [use rules](https://naif.jpl.nasa.gov/naif/rules.html), [citation guidance](https://naif.jpl.nasa.gov/naif/credit.html). See Acton (1996), Acton et al. (2018), Park et al. (2021), and Annex et al. (2020), as recorded in the source registry.
- **LOLA terrain:** NASA LRO/LOLA, GSFC Planetary Geodesy Data Archive; [Barker et al. 2023 products](https://pgda.gsfc.nasa.gov/products/90), [Barker et al. 2021 site products](https://pgda.gsfc.nasa.gov/products/78).
- **Illumination and Earth-visibility reference maps:** [NASA GSFC PGDA, Mazarico et al. 2011](https://pgda.gsfc.nasa.gov/products/69).
- **Moon model:** [NASA's Goddard Space Flight Center](https://svs.gsfc.nasa.gov/14959/). Web adaptation preserves geometry/UVs and resizes embedded maps; runtime normalizes and relights the model. Display only.
- **CGI Moon Kit color and global elevation:** [NASA's Scientific Visualization Studio](https://svs.gsfc.nasa.gov/4720/).
- **Star catalogue:** [Yale Bright Star Catalog, 5th Revised Edition (Preliminary), Hoffleit and Warren (1991), hosted by NASA/GSFC HEASARC](https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html). Filtered to 4,103 stars through magnitude 5.8 for contextual display. This project uses data provided by HEASARC, a service of the Astrophysics Science Division at NASA/GSFC; see its [data-use policy](https://heasarc.gsfc.nasa.gov/docs/heasarc/data_policy.html).
- **Landing-site and mission facts:** NASA/NSSDCA, NASA/LROC, ESA, CNSA, ISRO, JAXA, USGS/IAU, mission providers, and the publications named in `data/provenance.json`. Source roles and coordinate caveats are retained there and in `data/landing_sites.json`. Citing a factual source does not convey permission to reproduce its images or prose.
- **Interface font:** Inter, Copyright 2020 The Inter Project Authors; SIL Open Font License 1.1 in `fonts/OFL.txt`.
- **Math fonts:** KaTeX font software, copyright Design Science, Inc. and Khan Academy; SIL Open Font License 1.1 in `fonts/KaTeX-OFL.txt`.
- **Software:** React/React DOM, Three.js and KaTeX, plus the development and scientific libraries listed in the submission resource register. Installed npm license and notice texts are preserved in `THIRD_PARTY_NOTICES.txt`; Python license evidence is recorded with the repository submission pack.
- **Hosting and demo production:** [Vercel](https://vercel.com/) hosts the app. The demo is planned with [OBS Studio](https://obsproject.com/) for recording, [DaVinci Resolve](https://www.blackmagicdesign.com/products/davinciresolve) for editing, and narration by Jesse Whiting and Elliott Crosby.
- **Project Seraphim logo:** Designed in Adobe Illustrator. Browser and touch icons are resized exports of the supplied artwork.
- **SI assistance:** OpenAI Codex assisted code and documentation. Anthropic Claude Opus 5.5 assisted code. See `si-disclosure.json`. Scientific source data are externally sourced; derived numerical products are calculated by the documented pipeline.

Exact source URLs, file checksums, preprocessing details and citations are in `data/provenance.json`, `models/provenance.json`, `textures/provenance.json` and `data/stars.provenance.json`.
