# Lunar Landing Site Navigator UI direction

This saves the interface direction reviewed with Elliott on November 14, 2026.
The typography, sharp edges, restrained dark palette, and overall appearance were approved.
Trek workspace is the selected starting layout. The other three layouts are retained as references.

## Approved navigator implementation — November 14, 2026

This direction supersedes the historical layouts and sidebar/dashboard descriptions
below. The user approved the slim horizontal controls and requested a complete
implementation retaining all current functionality. Product name: Lunar Landing
Site Navigator. Keep the existing Inter, dark palette, and square edges.

- One horizontal row: Location, Landing (UTC), Duration, one primary action, and
  Advanced. Individual fields open contextual editors; no persistent sidebar.
- Location can be anywhere, exact coordinates/map selection, or a radius. Landing
  can be any available date, exact, or a range. Duration can be fixed or a range.
  Analyze handles fully fixed missions; Find options explores the open fields.
- Inputs and results collapse independently with arrows; all state is preserved.
- Results are a compact table with three rows initially, and more on demand.
  Checking a scenario immediately adds it to Compare; unchecking removes it.
  There is no separate Add to comparison action.
- Open a row for Results, Timeline, Terrain, and Compare. Retain detailed data,
  horizon, terrain geometry, power assumptions, nearby alternatives and exports.
- Site callouts use a surface dot, diagonal leader, horizontal rule, and site name
  or number above the rule. Stagger overlapping callout labels.
- Omit South pole and other view-preset controls. Selecting a location centers it.
- Sources live in the quiet footer beside credits and the time-zone clock. The
  compact searchable picker retains all supported zones and fixed UTC offsets,
  names each time zone, and orders by current UTC offset west to east.
- Keep the latest main-branch performance/cleanup changes; do not restore removed
  legacy Planning components or replace the approved layout with older UI.

The implementation uses the real science/data layers. Duration ranges sample at
most eight lengths; search results are sampled candidates, not a global optimum.
Flat-horizon previews and terrain-aware refinements remain explicitly identified.
The saved index.html remains the earlier typography/palette reference.

## Current planning flow — November 14, 2026

The latest request supersedes the separate Moon/Planning pages below. Keep one
Planning workspace without page tabs or preset locations. Accept entered coordinates
or a click on the Moon, landing date and mission duration. Show a target-based verdict,
sunlight and Earth visibility first; place custom minima, outage limits, clearance and
power assumptions behind Advanced. Opening Advanced also reveals the power estimate.
Open Dashboard from the right side to show Inputs, Results, Timeline, and Compare
in a dialog and hide the workspace side panels. The Timeline tab shows the timeline
and the Sun and Earth tracks over a 2D local horizon. Where available, the chart
uses the site’s LOLA terrain skyline. Drag either chart horizontally or use the
shared slider to update both charts. The Moon shows its scale beside the cursor coordinates. The
compact footer has credits and a clickable clock with a display time-zone selector.
Mission dates and the timeline use UTC. Keep the approved typography, palette and square controls.

Find a site supports independent optional location-radius and landing-date limits;
neither selected means a sampled search across the Moon and available dates. Offer
nearby date/location alternatives with metric differences, and a compact comparison
of user-added scenarios with optional detailed metrics. Clearly distinguish arbitrary
coordinate flat-horizon estimates from the exact shipped terrain masks. The default
50% visibility targets are editable assumptions, not official challenge thresholds.

Earlier page and interaction descriptions below are historical references.

## Latest view direction — November 14, 2026

Moon is now the default application page. Solar view is parked at the user's request:
keep its source, NASA assets, orbital data and mockups, but hide it from navigation
and do not load it on startup. The production entry point exposes Moon and Planning.

The Moon page uses NASA's LRO GLB, with optional landing-site markers, Focus site,
and zoom controls. Keep a Scale popout button and cursor
latitude/longitude at the lower left, on the Moon page only. Compute coordinates
from the pointer's intersection with the Moon, updating during pointer movement and
camera changes; update the popout's distance bar when zoom or viewport changes. The viewing
light is contextual, not a simulated epoch's illumination. Site selection carries
between Moon and Planning. All existing planning data and calculations remain available.

The following solar direction is retained for future work, not an active page:

The user approved the separate 3D Moon page in `mockups/moon-view-v1.png`.
For the solar page, use NASA 3D models/textures in a fixed-camera overview, with
no user rotation. Update positions against current time and show only future
trajectory segments starting at the current body positions; do not show past trails.
Keep both pages minimal and visually consistent. `mockups/solar-view-v4.png` is the
approved solar mockup. It illustrates appearance rather than actual
NASA assets or calculated positions. Show approximately six months of future paths,
without a time-span label, a Future path box, or a Now box. Add a bottom-left Scale
button with an on-demand information panel showing each body's physical diameter
scale in meters per screen pixel (m/px), not size sliders; the mockup shows it open.
Numbers in the image are illustrative; production must derive them from projected
diameter and update them with the view. Move the Sun farther left, place Earth about
two thirds across from the left, and bring the Moon closer than in revision 3.
Improve body detail and use a camera lowered 60 degrees
from overhead (30 degrees above the orbital plane), shifted slightly right.
Generation prompts and implementation notes are in `mockups/prompts-v4.md`.
The saved HTML below preserves the earlier layout reference.

## Planning interactions — November 14, 2026

The Planning view follows the approved minimal Moon workspace concept. Analysis is
closed initially and opens a right-hand inspector with interval metrics and expandable
local horizon, lander parameters, and site facts. On narrow screens it opens over
the Moon; its contents scroll inside the panel.

Keep detailed timelines and site comparison out of the default workspace. One
`Timelines & comparison` button beside the time controls opens a modal with
Timelines, Compare sites, and Local horizon. The first two share site checkboxes.
Timelines and Local horizon let you select the primary site. Local horizon shows
that site at the shared cursor time. The inspector's `Compare sites` action opens the
same modal directly to comparison. Escape or Close dismisses it and returns focus
to the initiating button. The background scrubber is hidden while the modal is open.
Date range, chosen sites, parameters, and cursor remain shared.

Planning fills the viewport without page scrolling. Keep one compact time-control
row at the bottom, without a footer or a repeated timestamp over the map. Date-range
editing belongs inside the Timelines & comparison popout. Only open inspectors and
dialogs scroll their contents.

Metric info popouts contain one sentence explaining what the value means and how
it is calculated; omit classification labels and Learn more links. Detailed sources
remain in Sources & methods. Use a sparse field of small, dim, crisp stars in both
active Moon views, following the supplied Moonquake Map reference. Avoid dense
Milky Way haze and enlarged star textures. Render real bright-star catalog positions
at screen resolution, with credit and contextual purpose in Sources & methods.

Timeline and 3D drag surfaces must not select browser text while tracking. Keep
metric values, comparison tables, and explanatory text selectable for copying.
Timeline keyboard controls are arrow keys (one hour), Shift + arrow (one day),
and Home / End (interval bounds).

## Review refinements — November 14, 2026

- Start the Moon explorer at the south pole with landing sites visible. Use Focus
  site to center the selected site.
- Use clear site-name rows with the coordinate type beneath the name. Keep
  comparison checkboxes aligned with their names and types.
- Keep the scale in a dismissible popout. Cap zoom for buttons, keyboard,
  wheel and pinch, including after resizing the viewport.
- Local terrain uses the textured 40 km LOLA terrain patch centered on the selected
  site. Scientific visibility uses the separate LOLA horizon masks.
- Site facts show coordinates once, then elevation, regional slope and horizon
  range. Put published elevations, coordinate notes, references, model details and
  limitations in Sources & methods, available on both active pages.
- Remove the repetitive “Why the sites differ” narrative. Keep the comparison table.
- Align metric information buttons in one column at the far right, after the values.
- Planning dates stay within the shipped ephemeris: January 1, 2026 through the
  January 1, 2029 boundary sample. The end boundary closes the 2028 interval;
  it does not provide coverage for 2029 scenarios.
- Timeline drags suppress browser text selection throughout the gesture, including
  outside the chart. Other values and explanations remain selectable.

## Open the reference

Open [index.html](index.html) directly in a browser. No build step, package installation,
server, API key, or Codex session is required. The buttons below the interface switch
between Trek workspace, Site comparison, Horizon view, and Window planner.

Inter loads from Google Fonts when available; Arial is the offline fallback. All other
rendering and interactions run locally. Site selection, date selection, and time scrubbing
are illustrative interactions. The preview does not contain real terrain, ephemerides,
illumination, or communications calculations, and changing the date does not compute new
science results. Coordinates and curves must be validated before use in the application.

## Product design requirements

- Dark mode with flat charcoal surfaces and readable neutral text.
- Sharp edges: use square buttons, fields, panels, and tables. Avoid pill controls.
- Keep the approved Inter typography and aligned, tabular numbers.
- Use plain labels. Add supporting or subheading text only when it is vital to a decision.
- Do not add top-right labels such as "Design study", "Sample data", or similar status
  decorations. The reviewed label was explicitly rejected; it has been removed from every
  saved layout. Necessary data provenance belongs in a quiet footer or an on-demand panel.
- No glowing elements, purple gradients, glass effects, decorative animation, or generic
  marketing/dashboard filler.
- Keep the interface simple, lightweight, fast, and immediately understandable.
- Use color to explain information: amber for sunlight and blue for Earth visibility.
  Always pair color with a label or shape.
- Preserve keyboard navigation, visible focus, legible type, and layouts that reflow on
  narrow screens. Essential information cannot depend on hover.

## Layout

The main workspace has a compact header, a date control, a site list on the left,
a dominant map, a small inspector on the right, and a persistent timeline below.
Keep the selected site's Sun and Earth elevations close to the map. Comparison and
visibility-window views can support the main workspace; they are not additional required
features or a decision to change the team's existing plan.

Replace the reference's schematic terrain and sample calculations with the project's
actual data and science implementation. This reference is not the application entry point.

## Reference tokens

| Role | Value |
| --- | --- |
| Background | `#0d0f12` |
| Panels | `#15181c` |
| Dividers | `#343940` |
| Main text | `#eff1f3` |
| Secondary text | `#a6afb9` |
| Sunlight | `#e6bc72` |
| Earth visibility | `#8eb9df` |
| Control corner radius | `0` |
| UI font | Inter, Arial, sans-serif |
| Numbers and coordinates | System monospace with tabular figures |
| Base UI size | 14 px |

These are the values used in the approved reference, not a claim of NASA certification.
Adapt them to the application while preserving contrast and the visual direction.

## NASA references

- [NASA.gov](https://www.nasa.gov/): typography and restrained navigation.
- [Moon Trek](https://trek.nasa.gov/moon/): map-led workspace with edge controls.
- [Worldview](https://worldview.earthdata.nasa.gov/): sidebar and persistent timeline.
- [Open MCT](https://nasa.github.io/openmct/): scientific plots and time navigation.
- [NASA Eyes](https://eyes.nasa.gov/apps/solar-system/): sparse controls over visualization.
- [Horizon Design System](https://github.com/nasa/hds-core): current NASA typography and
  component reference. Its documentation recommends USWDS for non-NASA sites; including
  it here does not select it as an application dependency.

Potential implementation references are [Leaflet](https://github.com/Leaflet/Leaflet),
[uPlot](https://github.com/leeoniya/uPlot),
[MMGIS](https://github.com/NASA-AMMOS/MMGIS), and
[3D Tiles Renderer](https://github.com/NASA-AMMOS/3DTilesRendererJS).
Choose packages after reviewing the actual application stack. Keep 3D and expensive
terrain work out of the initial load unless the user's task requires them.

## Authorship and scope

This reference was created with OpenAI Codex assistance and reviewed by Elliott.
It preserves the team's visual preferences; it does not replace the team's product plan,
science requirements, or official challenge instructions. No NASA logo or insignia is
included. The SVG curves and contours are schematic graphics rather than NASA datasets.
