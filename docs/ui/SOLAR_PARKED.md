# Solar view — parked November 14, 2026

The user asked to hide Solar view and keep the work for later. Moon is the default.
Do not reintroduce a Solar navigation link without a new request.

Retained implementation:

- `src/components/SolarView.tsx`: fixed camera, current UTC, model labels and body-diameter scale popover.
- `src/visuals/orbits.ts`: inertial data loader, interpolation, six-calendar-month future sampling and schematic layout.
- `public/data/orbits.json` and `orbits.bin`: geometric, Sun-centred ECLIPJ2000 DE440 samples, hourly, 2026–2028 UTC. Separate from the Moon-fixed apparent planning ephemerides.
- `public/models/`: NASA Sun/Earth/Moon GLBs and provenance; Moon is also used by the active pages.
- `scripts/prepare_visuals.py`: downloads original NASA assets/kernels and generates optimized models and orbital products.
- `docs/ui/mockups/solar-view-v4.png`: latest approved visual direction; prompts remain beside it.
- Solar-specific selectors in `src/styles.css`.

The parked component is not imported by the application entry point. Its code is
typechecked, but omitted from the active production JavaScript. Its Sun/Earth/orbit
assets are retained as static files but not fetched by Moon. `UtcClock.tsx` is shared.

This implementation was parked before visual polish and full solar validation.
The first browser check showed that exaggerated lunar separation also exaggerated
the six-month lunar trail into loops; refine that display mapping before enabling.
The future arc direction/composition and Earth lighting also need comparison with
the approved mockup. Body scale readouts are derived from physical diameter and CSS
pixel diameter; the nonlinear distance compression does not preserve interbody scale.
Do not claim that the mockup's orbital shapes or the current schematic display are
metric trajectories. Geometry must remain distinct from the existing site analysis.
