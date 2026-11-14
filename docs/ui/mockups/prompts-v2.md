# Solar view revision — November 14, 2026

Generated using the built-in image_gen tool, editing solar-view-v1.png. Output: solar-view-v2.png. This mockup illustrates realistic 3D asset appearance; it does not contain actual NASA 3D models or computed orbital data.

The user approved moon-view-v1.png. The solar revision is a proposal pending review.

Requested production behavior:
- NASA 3D models/textures for the Sun, Earth and Moon.
- A locked camera, with no user rotation in the solar view.
- Positions update against current UTC, using ephemeris data.
- Show only future trajectory segments, beginning at the current positions. Never show historical trails.
- Keep the interface minimal. The 7-day path horizon in the image is a proposed default, not a user-specified science requirement.
- Maintain the separate interactive 3D Moon page.

Implementation approach (not implemented): obtain ephemerides in advance and interpolate positions locally against UTC. Use a backend/offline preparation step and cached data; do not call JPL every animation frame or embed its API directly in the browser. Keep all bodies in a consistent coordinate frame/time system, and clip path samples before the displayed time. Real orbital motion will be subtle at 1x speed. Clearly disclose any exaggerated body sizes or schematic spacing in quiet footer/details.

Sources:
- NASA 3D Resources: https://www.nasa.gov/3D-resources/
- JPL Horizons API: https://ssd-api.jpl.nasa.gov/doc/horizons.html
- JPL API usage policy: https://ssd-api.jpl.nasa.gov/

## Exact generation prompt

Use case: ui-mockup; edit an existing desktop application screenshot. The provided image is the edit target: the first SERAPHIM Solar view mockup. Preserve its extremely minimalist interface, near-black background, slim header, Inter typography, sharp square corners, broad empty space, and Sun-left / Earth-right / tiny Moon next to Earth composition. Keep exactly one complete page, landscape 16:10, no browser chrome or external captions. The separate Moon explorer page has already been approved and is NOT being edited.

CHANGE 1 — 3D BODIES IN A FIXED VIEW:
Replace the flat illustrated Sun, Earth and Moon with convincingly realistic NASA-visualization-quality textured 3D spheres. The final production design is intended to use NASA assets; this generated mockup only illustrates their appearance. Large orange-gold Sun sphere on the left with fine realistic photospheric texture, no giant corona or lens flare. Earth smaller on the right with photorealistic blue ocean, green/brown continents, white cloud systems, sunlight from the Sun on its left side and naturally shaded right limb. Moon tiny but large enough to show gray craters and spherical shading, above-right of Earth, with lighting consistent with the Sun. Make Earth and Moon slightly larger than in the source so their 3D textures read. The overall composition remains a straightforward fixed orthographic orbital diagram. The CAMERA IS LOCKED: no rotation controls, no drag-to-rotate hint, no perspective orbit widget, no axis gizmo. This remains easy to read like a 2D layout but uses fully 3D-rendered bodies. Keep only small adjacent plain labels "Sun", "Earth", "Moon". Do not add other planets.

CHANGE 2 — ONLY FUTURE PATHS:
Completely REMOVE both full dashed ellipse/ring orbit paths from the source. Draw ONLY TWO SHORT, OPEN, thin dashed gray future trajectory arcs, each starting exactly at the corresponding current body position and going forward in one direction, with one small arrowhead toward the far end. One path starts at Earth and curves upward/left along its orbit around the Sun, ending after a short arc near the upper middle-right of the screen. The second starts at the Moon and curves toward the right and downward around Earth for less than a quarter turn. No complete circles, no full ellipses, no past trails or lines approaching the bodies from behind, no repeated positions or ghost planets. Add a single quiet caption near the Earth path: "Next 7 days". Everything behind the current positions is completely empty.

CHANGE 3 — REAL-TIME CONTROL:
Keep header wordmark "SERAPHIM", nav "Solar view" with amber underline and "Moon", with the rest of the header empty. Replace the source bottom timeline area with a thin unified bottom toolbar: a small square outlined button labeled "Now", date "14 Nov 2026", a digital UTC clock "19:30:42 UTC", and a plain understated dropdown "Future path: 7 days". The clock visually includes seconds to communicate continuous real-time updates. No timeline history, no past date navigation, no decorative LIVE badge, no top-right status label, no redundant play or pause controls. A quiet tiny bottom-left footer reads "Concept · Not to scale". This timestamp and geometry are illustrative, not a claim of a computed real ephemeris.

Constraints: minimalist, dark #0d0f12, off-white #eff1f3, border gray #343940, amber #e6bc72, Earth blue #8eb9df, no rounded corners or pill controls, no cards, sidebars, panels, statistics, subtitles, gratuitous controls, dense stars, glowing UI, purple gradients, marketing copy or NASA insignia. Keep real 3D body texture and directional lighting. Preserve blank space. This is a picture of a minimal usable app, not an infographic or movie poster.
