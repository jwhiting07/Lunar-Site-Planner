# Copyright, licensing and submission review

Reviewed November 15, 2026. **The main libraries and font are copyrighted but licensed for reuse.** No identified runtime asset has an obvious permission prohibition for this educational use, subject to the terms and credits below. This is an evidence-based project review, not a blanket statement that every file is copyright-free or that uninspected future video material is cleared.

## What was inspected

- The supplied submission form; current README, package manifest and lockfile; Python requirements and installed package metadata; application imports, source-fetching and asset-preparation scripts; scientific references and validation reports; asset provenance; font license; and historical AI mockup documentation.
- All **166 npm lockfile entries**, of which **116 are installed** on this platform. Installed versions match their lockfile records. The other 50 are optional packages for other platforms and are not claimed as installed or shipped.
- **21 installed Python distributions**, including development/environment tools. Native libraries bundled inside wheels are not exhaustively mapped; available bundled notices are collected, but this is not a complete native-component inventory.
- **105 scientific/source reference records**, plus the NASA Moon model and HEASARC-hosted star catalogue, for **107 resource records**. Duplicate URLs are retained where they document different roles.
- **123 distinct public URLs** were probed with TLS verification enabled: **110 returned successful HTTP responses; 13 did not**. The results are in `evidence/link-checks.json`. A successful response does not establish reuse permission; a failed response may reflect filtering, timeout or certificate configuration rather than a private page.

## Findings by material

| Material | Evidence / terms | Result and action |
|---|---|---|
| Team project code | Root `LICENSE`: MIT, copyright 2026 Jesse Whiting | Preserve the existing copyright and permission notice. That license does not replace external code, data or font terms. Authorship beyond the repository record is not independently certified. |
| Browser libraries | React, React DOM, scheduler, Three.js, KaTeX and commander all declare MIT; installed notices located | Collected exact local license text in `public/THIRD_PARTY_NOTICES.txt`. Preserve it with the published application. Three.js is modified at runtime for display lighting; its original notice remains. |
| Build and test dependencies | Lockfile licenses: MIT (154 entries), ISC (6), Apache-2.0 (3), BSD-3-Clause (2), CC-BY-4.0 (1) | No unknown license field in the lockfile. License declarations were inventoried, not treated as an originality guarantee. The CC-BY-4.0 entry is `caniuse-lite`, used by development tooling; attribution and collected notices identify it. |
| Native build-tool packages | Three platform-specific esbuild/Rollup packages lack standalone top-level license files | Included their installed upstream esbuild/Rollup license notices and recorded that basis. They are development tools, outside the browser bundle. |
| `stackback` 0.0.2 | Installed test dependency declares MIT, author Roman Shtylman; no top-level license/notice file found | Recorded the declaration, author and repository without inventing a copyright year or license text. It is development-only and is not in the browser distribution. Obtain an authoritative notice before separately redistributing that dependency itself. |
| Python tools | NumPy, SpiceyPy, Rasterio, pyproj, Requests, Pillow and pytest; exact installed metadata and available license texts collected | Used to prepare/check derived products and support the custom endpoint. `.venv` is excluded from Git and is not bundled in the browser app. Keep upstream notices and review native-component terms if distributing a complete Python environment. |
| Python transitive components | Includes `certifi` under MPL-2.0, and mixed permissive/bundled licenses | This is not an all-MIT environment. MPL obligations attach to covered files if redistributed; using the library does not automatically relicense this project's own code. Do not distribute the entire environment under only the project's MIT notice. |
| Inter font | SIL OFL 1.1; copyright and full text already in `public/fonts/OFL.txt` | Reuse is licensed; keep the font license with the font. Included it in the collected public notices too. |
| KaTeX fonts | SIL OFL 1.1 confirmed in the installed font metadata and [upstream clarification](https://github.com/KaTeX/KaTeX/issues/339) | Keep `public/fonts/KaTeX-OFL.txt` and the separate KaTeX code MIT notice with the production build. |
| SPICE kernels/toolkit | [NAIF use rules](https://naif.jpl.nasa.gov/naif/rules.html) permit kernel use and unmodified kernel redistribution; toolkit has its own terms | Cached original kernels are excluded from Git; derived numerical tables ship. Retain SPICE citations. Do not repackage a standalone toolkit mirror under the project MIT license. |
| LOLA terrain and visibility products | PGDA product pages [90](https://pgda.gsfc.nasa.gov/products/90), [78](https://pgda.gsfc.nasa.gov/products/78), [69](https://pgda.gsfc.nasa.gov/products/69); existing source citations and hashes | Public scientific products with provider citation guidance. Credit Barker et al. 2023/2021 and Mazarico et al. 2011 for their respective uses. No blanket public-domain declaration is made for all archive material. |
| NASA Moon model and CGI Moon Kit | Item credits checked at [Moon model](https://svs.gsfc.nasa.gov/14959/) and [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/); [NASA media-use guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) | Educational/informational use is generally permitted under NASA's guidance, with acknowledgement and no implied endorsement; third-party credited material can have separate restrictions. Preserve the specific item credits. Record web resizing/relighting as modifications, not new NASA science. |
| Yale Bright Star Catalog | Hoffleit and Warren 1991, hosted by HEASARC; [catalogue page](https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html), [HEASARC use policy](https://heasarc.gsfc.nasa.gov/docs/heasarc/data_policy.html) | HEASARC states its materials are freely available for use and supplies acknowledgement guidance. Keep the catalogue-author and host credit. Do not describe Yale-authored data as automatically NASA-owned. |
| Mission and location catalogue | NASA, ESA, CNSA, JAXA, ISRO, USGS, papers, mission providers, and a few news/background sources are recorded | The implementation uses factual coordinates, dates and descriptions. No separate mission-provider or news photographs were found in shipped runtime assets. A link or numerical fact does not authorize copying a publisher's prose, figures or images into the video. |
| AI concept image | Historical prompt record in `docs/ui/mockups/prompts-v1.md` | The historical concept image is excluded from the current application and submission materials. Use actual app footage in the demo. |
| Final video/audio/music | No finished demo, music or narration file found in the inspected project | A final-media rights check remains open. The proposed recording uses the application and original team narration and requires no outside footage or music. Any added asset needs its own source and permission evidence. |

## Notices and disclosures prepared

- `public/CREDITS.md`: dataset, model, texture, catalogue, font and software credits.
- `public/THIRD_PARTY_NOTICES.txt`: installed npm notice texts and Inter and KaTeX font notices, copied by Vite into the production build.
- `public/si-disclosure.json` and the README: descriptive and machine-readable SI assistance disclosure. NASA source data are distinguished from SI-assisted code and numerically derived products.
- `docs/submission/03-RESOURCES.md`: resource names, full URLs and uses, including complete source and software inventories. Unused suggested libraries in design notes are identified as references rather than actual dependencies.
- `evidence/npm-inventory.json`, `python-inventory.json`, `python-notices.txt`, `source-register.json`, `link-checks.json`: supporting evidence and exact installed versions.

## Public-link issues to finish

| Issue | Finding / next action |
|---|---|
| Final project URL | [Live app](https://lunarsiteplanner.com/) and [public source repository](https://github.com/jwhiting07/Lunar-Site-Planner) verified without authentication. |
| Demonstration URL | No recorded demo or public video link was found. Record, export under 30 seconds, upload and test public access. |
| One archived ESA source | `https://www.esa.int/esapub/annuals/annual06/ar6_activities.pdf` returned 404. Use [ESA — Impact landing ends Smart-1 Moon mission](https://www.esa.int/articles/about-us/directorates/science/smart-1/impact-landing-ends-smart-1-moon-mission), which confirms the recorded impact time. The submission resource guide includes this replacement while preserving original historical provenance. |
| Other unconfirmed source links | Three LROC URLs and four CNSA URLs timed out or reset; one Wiley DOI and two OpenAI pages returned 403; the challenge page failed local certificate verification and the web fetch returned 502. Do not describe these as freshly verified public links. Check them in a normal signed-out browser or use an accessible official equivalent before final form entry. The official challenge was discoverable through a search excerpt, which is not a substitute for the complete submission guide. |

## Content and build checks

The summary contains **127 words and 932 characters**, within the form's suggested 50–200 words and 1,500-character counter. The video voiceover contains **49 whitespace-separated words**; the actual final duration still needs measurement. `npm run build` passed during this review, including TypeScript checking. The generated credits, notices and SI metadata were confirmed in `dist/`. The source registers and application science were not rewritten; the scientific test counts and numerical evidence discussed in the project details refer to the stored project validation reports, not new validation runs in this review.

To refresh the resource and license inventory:

```powershell
& '.\.venv\Scripts\python.exe' scripts/review_submission.py
# Optional public HTTP probes (TLS verification remains enabled):
& '.\.venv\Scripts\python.exe' scripts/review_submission.py --check-links
```

## Submission requirements from the supplied form

- Summary, project details and SI-use selection completed accurately.
- Public demo: at most 30 seconds for video, or at most seven slides including title/introduction.
- Separate public final-project link; no password, permission or registration required.
- NASA data/resources used and listed; other code, text, images, data and tools also listed.
- SI-generated images/video visibly watermarked; SI audio, code and data acknowledged in descriptive text and metadata as applicable; generated content must not use, contain or modify NASA branding/design elements.
- Original-work and permission declarations must reflect the actual final materials. Copyrighted open-source software can be used under its licenses; claiming “nothing is copyrighted” would be inaccurate.
- Save progress, click **Submit for Judging**, and verify the success notification by the applicable local-event deadline. No judging submission was made by this review.
