# Solar view revision 4 — November 14, 2026

Output: solar-view-v4.png. Generated with the built-in image_gen tool, editing solar-view-v3.png. The prior three revisions remain available.

Latest user correction:
- Scale is a physical-distance-per-screen-pixel information readout for each body, expressed in m/px. It is not a slider or size adjustment.
- Move the Sun farther left and place Earth around two thirds of the width from the left.
- Bring the Earth–Moon spacing closer to the preceding composition.
- Preserve the other features and the approved oblique camera direction.

The image shows the Scale panel open. Its numbers are illustrative approximate diameter-to-pixel ratios, not measured outputs or validated science. In implementation compute each body's displayed diameter scale as physical diameter in meters divided by its projected diameter in CSS pixels, updating when viewport, projection or display size changes. Define the pixel unit consistently. These per-body values do not describe orbital-distance scale, since body sizes and orbital spacing are independently exaggerated. The user's 4,000 m/px example specified the kind of readout, not a required Earth value.

The six-month paths and model appearances are conceptual. Use actual NASA assets and validated ephemerides during implementation.

## Exact generation prompt

Use case: ui-mockup. Precisely edit the attached SERAPHIM solar-view-v3 app screenshot. Keep all styling and the already approved oblique camera angle, fine long future-only orbital paths, realistic 3D bodies, dark blank space, header, labels and bottom-right date/time. Make ONLY the following composition and Scale panel corrections. One full landscape 16:10 app screenshot, no browser frame, no external annotations.

1. REPOSITION THE BODIES:
Move the Sun substantially farther LEFT: center its sphere at about 18% of screen width and 44% of screen height, instead of the source's 40% width. Keep its existing approximately 300px diameter on a 1586px wide canvas, its fine orange-gold textured spherical appearance, and small adjacent "Sun" label.
Place Earth's CENTER at exactly TWO THIRDS (66.7%) of screen width, about 58% of screen height. Keep its existing approximately 120px diameter, detailed continents/clouds and spherical shading.
Bring Moon CLOSER TO EARTH than the source, at about 76% screen width and 48% screen height. Keep a clear modest empty gap between the silhouettes, with about 170px center-to-center separation on a 1586px wide canvas, rather than the source's roughly 250px. Moon remains much smaller, about 40px diameter. Keep small adjacent "Earth" and "Moon" labels. No numerical coordinate text.
Respect these positions while retaining the current fixed perspective: camera tilted 60 degrees down from overhead, i.e. 30 degrees above the orbital plane, shifted slightly right. Do not flatten into a top-down 2D diagram. Move path start points with their bodies and subtly adjust the broad arcs so the scene feels coherent. Preserve the two thin gray dashed open arcs extending forward from current Earth/Moon locations through foreground toward the left/background, with tiny endpoint arrows. Six-month-future design intent, no historical paths, no complete rings or text about the time horizon. Do not add new orbit lines. Keep generous dark negative space especially on the right.

2. SCALE MEANS PHYSICAL DISTANCE PER SCREEN PIXEL, NOT ADJUSTABLE SIZE:
Keep the bottom-left square outlined "Scale" button, and show its compact dark popover OPEN. REMOVE ALL SLIDERS, ALL THUMBS, ALL SIZE-ADJUSTMENT CONTROLS. Replace the panel contents with three understated tabular readout rows, body name left and its meters-per-pixel value right. Render these exact strings:
"Sun"    "4,640,000 m/px"
"Earth"  "106,000 m/px"
"Moon"   "86,900 m/px"
Small quiet note beneath the rows: "Body diameter scale".
Panel about 330px wide at the lower left, flat charcoal #15181c, hairline gray border, sharp square corners, readable small Inter typography. Values use aligned tabular figures. Keep the Scale button directly beneath it. These numerical values are approximate illustrative diameter-to-screen-pixel ratios for the depicted sizes, not production measurements. Do NOT render this explanation. No sliders, no extra toggles, no size multipliers. This panel is an information readout only, normally hidden until Scale is clicked.

INVARIANTS:
Header stays exactly SERAPHIM | Solar view (amber underline) | Moon, rest empty. Bottom right stays "14 Nov 2026   19:30:42 UTC", unboxed. No Now button, no Future path box, no Next 7 days label, no LIVE badge. No other panels, extra headings, camera widgets, dense stars, glow, purple, rounded corners, marketing decorations or NASA logos. Body surfaces stay realistic and sharp; do not change the approved visual direction. This is a generated concept appearance, not a computed physical scene.
