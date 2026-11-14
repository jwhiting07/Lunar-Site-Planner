# Solar view revision 3 — November 14, 2026

Output: solar-view-v3.png. Generated using the built-in image_gen tool, editing solar-view-v2.png. This is a conceptual image, not a working application, actual NASA model render, or computed six-month ephemeris.

User-requested direction:
- Add a bottom-left Scale button opening controls for each body's display size. The mockup shows the panel open; normally it is collapsed. Sliders are an interpretation of the requested scale panel.
- Remove Next 7 days, the Future path box, and the Now box.
- Use a visually clear future path horizon of approximately six months. No past trails. The image does not prove the path corresponds to that time interval.
- Improve all three bodies' appearance; production should use NASA assets.
- Increase Earth–Moon spacing.
- Lower the camera 60 degrees from overhead and shift slightly right. Interpreted as elevation 30 degrees above the orbital plane, with roughly 12 degrees of rightward azimuth. Exact rightward offset remains an implementation choice.
- Keep the camera locked, real-time UTC updates, and the approved separate Moon page.

Implementation notes: use a common coordinate frame for future paths. In a Sun-centered frame the Moon's path travels with Earth; avoid drawing six overlapping geocentric orbit loops. Use ephemeris samples for the selected six-month interval, clip every sample before current UTC, and interpolate locally. Distinguish physical radii/distances from exaggerated display scale. The generated arrows, geometry, texture and lighting remain illustrative and need science validation in implementation.

## Exact generation prompt

Use case: ui-mockup. Edit the attached SERAPHIM Solar view screenshot into a much more refined minimalist fixed-camera orbital viewer. One complete desktop app screenshot, landscape 16:10. The source is an edit target, not a layout to preserve literally: preserve only the slim header styling, dark palette, typography, and simplicity; REDESIGN THE CAMERA, BODY ARRANGEMENT AND ORBIT PATHS as specified below.

CAMERA AND COMPOSITION — ESSENTIAL CHANGE:
This must be a convincing oblique 3D view of a shared orbital plane, NOT a flat frontal diagram. Starting from a directly overhead aerial camera, tilt DOWN by 60 degrees so the camera is now only 30 degrees above the orbital plane; shift its azimuth approximately 12 degrees toward the right. Lock this camera; no user rotation widget. The projected orbital curves are shallow foreshortened ellipses, slightly diagonal across the screen, with a clear foreground and background. Generous negative space above the scene. Reframe to fit the long arcs: position Sun at about 40% across and 44% down the whole image, Earth at 76% across and 60% down, and Moon at 89% across and 43% down. Sun about 330px diameter on a 1586px wide canvas, Earth about 150px, Moon about 48px. The Moon is significantly farther from Earth than in source image, with at least one Earth diameter of empty gap between their silhouettes, still visually associated with Earth. Label each body once with small plain text, close enough to read: "Sun", "Earth", "Moon". No axes, other planets, compass, grid, coordinate gizmo or camera controls.

IMPROVE ALL THREE 3D BODIES:
Realistic sharp NASA scientific-visualization-quality appearance, detailed natural textures. The Sun has fine nonrepeating granular orange-gold photospheric structure and subtle small sunspots, NOT a rough rocky planet, no dramatic flares or halo. Earth has credible continents, rich blue oceans, delicate white clouds, spherical dimensional shading with the side facing the Sun illuminated, crisp surface detail rather than a plastic marble or painted cartoon. Moon gray craters and maria, natural irregular detailed albedo, convincing spherical shadow with sunlight coming from the Sun. All bodies truly look 3D. No artistic lens flare, heavy bloom, glowing UI or glossy exaggeration. The final implementation will use NASA assets; this AI-generated picture illustrates the intended appearance.

FUTURE ORBITS — SIX MONTHS WITHOUT ANY TEXT ANNOTATION:
Completely remove the source's short dashed path curves and the words "Next 7 days".
Create TWO long, delicate muted-gray future trajectories in a common SUN-CENTERED coordinate frame, beginning at the current Earth and Moon positions, proceeding in the SAME orbital direction, and sweeping for approximately HALF AN ORBIT around the Sun (roughly six months). They should form an elegant broad foreshortened arc that begins at the bodies on the right, sweeps through the foreground below the Sun, continues toward the left, and ends at the far-left/background side of the orbital plane. One curve is Earth's future path; the other is Moon's future heliocentric path, a subtle gently undulating companion arc suggesting successive lunar cycles. Do not draw repeated tight lunar loops or spaghetti. Two paths total. Use fine low-contrast lines, small regular dashes if needed, with one tiny directional arrow near each endpoint. Keep all path segments ONLY FORWARD of the current bodies. No lines behind their starting positions, no past trails, no complete orbit rings, no floating planet duplicates, no date annotations, and no labels stating time span. Let the trajectories and perspective explain the geometry. Diagram spacing and body sizes are intentionally exaggerated for clarity.

UI — REMOVE THE UNWANTED CONTROLS:
Slim header identical in style to source: "SERAPHIM", text nav "Solar view" with restrained amber underline, and "Moon". Everything to their right is empty. Absolutely NO top-right decorative status.
At bottom REMOVE the "Now" button, REMOVE the entire "Future path: 7 days" dropdown, REMOVE the concept caption. Keep only a simple unboxed date and live time readout "14 Nov 2026   19:30:42 UTC" in small gray tabular type aligned at bottom right. No timeline, no play control, no extra fields.
BOTTOM LEFT place one small square-cornered outlined button labeled "Scale". In this image SHOW ITS POPOVER OPEN as an interaction preview: a compact flat charcoal panel about 220px wide, anchored directly above the button, with three neatly spaced rows labeled "Sun", "Earth", "Moon". Each row has one simple thin horizontal size slider with a small square thumb. Three controls only. Small muted footer inside panel: "Display sizes exaggerated". No other headings, no invented numbers, no toggles, no fourth slider. The panel is normally collapsed; this screenshot intentionally demonstrates the open state. Keep it unobtrusive in the lower-left negative space without overlapping bodies or trajectory endpoints.

STYLE:
Minimal, clean, legible, dark background #0d0f12, panel #15181c, borders #343940, text #eff1f3, secondary #a6afb9, Inter font. Thin sharp rectangular controls, modest scale, no rounded corners or pills. Nearly empty black space, very few if any stars, no scientific dashboard furniture. No large headings, sidebars, cards, decorative labels or fake NASA logo. No literal camera angle text. Preserve the elegant sparse feel of the original while actually changing camera perspective. This image is only Solar view; do not show the separate Moon page.
