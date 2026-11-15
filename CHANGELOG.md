# Release notes

## 0.1.0 — November 15, 2026

Initial release of **Lunar Site Planner**, built by Project Seraphim for the
2026 NASA Space Apps Challenge.

**[Use the application at lunarsiteplanner.com](https://lunarsiteplanner.com)**

### Mission planning

- Interactive 3D Moon with coordinate selection, known landing-site markers,
  cursor coordinates, and a distance scale.
- One planning workspace for location, landing time, and duration. Analyze a fixed
  mission or search open fields for sampled alternatives.
- Adjustable sunlight and Earth-visibility targets, outage limits, Earth
  clearance, and solar-power and battery assumptions.
- Ranked sampled matches, comparison of up to twelve scenarios, browser-persisted
  comparison selections, and CSV/JSON exports with parameters and references.
- Results, Timeline, and Compare views, with synchronized local-horizon,
  visibility, and power charts and mission-specific dates.
- Collapsible controls and results, keyboard Moon controls, and a searchable
  footer time-zone selector. Scientific dates and timelines stay in UTC.

### Science and data

- Precomputed NASA/JPL NAIF SPICE DE440 geometry with historical coverage from
  September 13, 1959 through the January 1, 2029 UTC boundary.
- NASA LRO/LOLA terrain profiles for nine shipped sites and 49 exact default
  search-grid locations; local Python service for additional coordinates.
- Coarse search screening followed by refinement of up to 48 candidates and
  reranking. Final mission summaries use 15-minute integration with 5-minute
  near-horizon probes; chart and export samples remain hourly.
- Recorded direct-SPICE, convergence, terrain, limited exhaustive-search, and
  ideal-storage battery comparisons, with measured discrepancies and assumptions.
- Source checksums, provenance records, references, and calculation traceability.

### Repository and documentation

- Lunar Site Planner branding and lunarsiteplanner.com as the application link.
- README walkthrough with team-supplied screenshots of the Moon workspace,
  sampled search results, and mission timeline.
- Separate development guide for terrain setup, deployment, and reproducibility.
- Updated package description and canonical GitHub repository metadata.

### Limitations

This is an educational prototype. Search does not prove a global optimum.
Uncached custom terrain requires a service; a static deployment alone cannot
generate it. Earth visibility is geometric, and power estimates use assumed
hardware and ideal storage. Small terrain features and events between probes
can be missed. The application does not establish landing safety, RF performance,
or thermal survival. See [validation](docs/VALIDATION.md) and
[mission-level validity](docs/VALIDITY.md) for the evidence and its limits.
