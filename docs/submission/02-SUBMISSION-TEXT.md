# Submission text

## Project name

Project Seraphim

## Summary — paste this paragraph

Project Seraphim is an interactive lunar planning tool that helps mission planners, educators, and the public compare landing locations, dates, and mission durations. Using NASA/JPL SPICE geometry and Lunar Reconnaissance Orbiter LOLA terrain data, it estimates when the Sun and Earth are visible above the local horizon, identifies darkness and communication-visibility gaps, and explores solar power and battery needs under adjustable assumptions. Users can inspect a 3D Moon, follow synchronized timelines and terrain views, search for scenarios that meet chosen targets, compare alternatives, and export results with source information. By bringing location, timing, terrain, and energy tradeoffs into one workspace, Seraphim makes complex lunar planning questions easier to explore and explain. It is an educational prototype, with documented assumptions and numerical validation, rather than flight-qualified mission software.

## Project details — paste the following sections

### What we built and why

Project Seraphim's application, Lunar Site Planner, addresses the Lunar Landing Site Navigator challenge by making sunlight and direct-to-Earth visibility easier to compare across lunar locations and mission dates. Near the south pole, a nearby ridge can change the local horizon enough to interrupt sunlight or hide Earth. A location's usefulness therefore depends on when a mission arrives, how long it stays, and the hardware and visibility targets being assumed.

The application brings these questions into a single interactive workspace. Users choose coordinates on a 3D Moon or enter them directly, set landing time and mission duration, and analyze a specific mission. They can also leave location, date, or duration open to search a bounded set of alternatives against adjustable sunlight, Earth-visibility and outage targets. Results can be compared side by side, retained in the browser, and exported as CSV or JSON.

### How it works

An offline Python pipeline uses NASA/JPL NAIF SPICE kernels, including DE440 ephemerides and lunar orientation data, to prepare Sun and Earth geometry. NASA LRO/LOLA elevation products provide local terrain horizons. Nine shipped locations and 49 exact default search-grid locations have precomputed terrain profiles; a local Python endpoint calculates profiles for additional coordinates when the source elevation rasters are installed. A static deployment supports cached profiles, while uncached custom terrain needs that endpoint.

The TypeScript calculation engine compares Sun and Earth directions with the terrain skyline and estimates sunlight, geometric Earth-visibility windows, longest gaps, solar generation, and idealized battery behavior. Hardware assumptions are adjustable. Final mission calculations use a 15-minute base step with 5-minute probes near detected horizon transitions, while charts and exported time series retain hourly samples. Synchronized timeline and terrain views help explain the results. The 3D globe provides visual context; its display lighting is separate from the scientific calculations.

### NASA and other resources

Core sources are NASA/JPL NAIF SPICE kernels, NASA GSFC PGDA LOLA elevation and slope products, published LOLA illumination and Earth-visibility maps for contextual checks and site selection, and NASA/LROC mission-location records. NASA's Moon model and CGI Moon Kit supply visual context and global elevation data. The background uses a filtered Yale Bright Star Catalog hosted by NASA HEASARC. Published NASA, partner-agency, USGS, research and mission-provider records support the landing-site catalogue. The submission resource list provides the source links and distinguishes calculation inputs, display assets, catalogue facts, methods and validation references.

The interface uses React, TypeScript, Three.js, KaTeX, HTML and CSS, with Vite and Node.js/npm for development and builds. Python preprocessing and validation use NumPy, SpiceyPy, Rasterio, pyproj, Requests and Pillow. Vitest and pytest support testing. The application reads precomputed JSON and binary files and stores comparison selections in browser localStorage. Git and GitHub provide source versioning. Vercel hosts the public app. The demo plan uses OBS Studio for screen capture, DaVinci Resolve for editing, and narration by Jesse Whiting and Elliott Crosby.

### Creativity, benefit and intended impact

The creative contribution is connecting location, arrival time, duration, terrain visibility and assumed energy needs in an interactive comparison flow. Users can start with a precise mission or explore alternatives, then inspect the timeline and local horizon to understand why the results differ. Exported results retain parameters and references, making the analysis easier to discuss and reproduce. The intended impact is to support education and early mission trade studies by making the tradeoffs visible and understandable.

### Verification and limitations

The repository includes numerical checks against direct SPICE calculations, finer time steps and terrain profiles, published visibility maps, an exhaustive reference for a limited search space, and a separate numerical battery calculation. The stored mission-level report passes the team's stated numerical budgets and retains discrepancies and threshold-sensitive cases. Those budgets are project choices, not NASA requirements or a claim of flight qualification.

Search samples a bounded set of scenarios and does not prove a global optimum. Terrain resolution can miss small obstructions, and events between integration probes can be missed. Earth visibility is geometric line of sight, not a verified radio link. Power and battery estimates use assumed generic hardware and ideal storage. Published-map comparisons have remaining differences in source terrain and epoch. The tool does not assess landing safety or thermal survival. These limits guide how the results should be interpreted.

## Use of Super Intelligence — disclosure text

The Project Seraphim logo was designed in Adobe Illustrator.

OpenAI Codex assisted project code, interface development, documentation, and submission preparation. Anthropic Claude Opus 5.5 assisted code development. Scientific values are calculated from the cited datasets by the documented numerical pipeline. The NASA Moon model, textures and star catalogue have their own source provenance. SI assistance is acknowledged in the project README and `public/si-disclosure.json`.

The form's exact SI option labels were not included in the pasted text. Select the options matching **code** and **text** assistance. ChatGPT is planned for favicon design. Before submitting, record whether it supplied design ideas for human-drawn artwork or generated artwork that appears in the final favicon. If generated artwork ships or appears in the demo, disclose image generation and follow the form's visible watermark requirements for the submitted media. The demo is planned with the two team members' own voices.

## Links

- **Project demonstration:** insert the final public video URL after recording and uploading. No completed demo file was found in this checkout.
- **Project:** https://lunarsiteplanner.com/ · public source: https://github.com/jwhiting07/Lunar-Site-Planner.
- **NASA Data / Space Agency Partner & Other Data:** use [03-RESOURCES.md](03-RESOURCES.md), including its complete reference appendix.

The prose above describes the implemented code. It does not claim that a final video, public deployment, or judging submission has already been completed.
