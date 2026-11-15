import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { enuBasis, type InstantState, type SiteDoc } from '../science';
import { loadNasaModel, disposeModel } from '../visuals/models';
import { clampMoonCamera, moonZoomLimits } from '../visuals/moonNavigation';
import { COORD_CLASS_LABEL } from '../ui/labels';
import { disposeStarfield, loadStarfield } from '../visuals/stars';

// Body-fixed (X,Y,Z) -> Three (X,Z,-Y), shared with the site's ME coordinates.
// models.ts aligns the native NASA LRO cube-mesh axes with this convention.
export function globePosition(lat: number, lon: number): THREE.Vector3 {
  const [x, y, z] = enuBasis(lat, lon).up;
  return new THREE.Vector3(x, z, -y);
}

/** Moon body-fixed, east-positive coordinates, using the existing site convention. */
export function globeCoordinates(point: THREE.Vector3): { lat: number; lon: number } {
  const normal = point.clone().normalize();
  return { lat: THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, normal.y)))), lon: THREE.MathUtils.radToDeg(Math.atan2(-normal.z, normal.x)) };
}

/** A readable scale length that fits the available CSS-pixel width. */
export function moonScaleBar(kmPerPixel: number, maxWidth = 100) {
  if (!(Number.isFinite(kmPerPixel) && kmPerPixel > 0 && Number.isFinite(maxWidth) && maxWidth > 0)) throw new RangeError('Distance scale requires positive finite dimensions.');
  const range = kmPerPixel * maxWidth;
  const exponent = 10 ** Math.floor(Math.log10(range));
  const factor = [1, 2, 5].filter(value => value * exponent <= range).at(-1) ?? 1;
  const km = factor * exponent;
  return { km, pixels: km / kmPerPixel };
}

const kmFormat = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 });
/** Time constant of the eased zoom, ms: the camera closes ~63 % of the remaining distance in this time. */
const ZOOM_TAU_MS = 85;
/** Minimum screen distance between site markers, px (a pin's hit area is 24 px). */
const MARKER_GAP = 22;

export function MoonView({ sites, primaryId, onSelect, explorer = false, local = false, inst = null, compact = false, onPick, savedSiteIds, markerLabels }: {
  sites: SiteDoc[]; primaryId: string; onSelect: (id: string) => void; explorer?: boolean; local?: boolean; inst?: InstantState | null;
  compact?: boolean; onPick?: (point: { lat: number; lon: number }) => void;
  savedSiteIds?: ReadonlySet<string>;
  markerLabels?: ReadonlyMap<string, string>;
}) {
  const pick = useRef(onPick);
  pick.current = onPick;
  const host = useRef<HTMLDivElement>(null);
  const pins = useRef(new Map<string, HTMLButtonElement>());
  const positions = useMemo(() => sites.map(site => ({ id: site.id, point: globePosition(site.lat_deg, site.lon_deg) })), [sites]);
  const positionsRef = useRef(positions);
  const focus = useRef<(id: string | null) => void>(() => {});
  const zoom = useRef<(factor: number) => void>(() => {});
  const hoverReadout = useRef<HTMLOutputElement>(null);
  const tipReadout = useRef<HTMLOutputElement>(null);
  const scaleReadout = useRef<HTMLOutputElement>(null);
  const scaleLine = useRef<HTMLSpanElement>(null);
  const primaryRef = useRef(primaryId);
  primaryRef.current = primaryId;
  const illumination = useRef(inst);
  illumination.current = inst;
  const redraw = useRef(() => {});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSites, setShowSites] = useState(true);
  const [orientation, setOrientation] = useState('south');
  const activeFocus = useRef<string | null>(null);
  // Choosing coordinates on the Moon must not re-centre the view on the new point.
  const skipFocusUntil = useRef(0);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: (devicePixelRatio || 1) < 2, powerPreference: 'high-performance' }); }
    catch { setError('3-D unavailable. Enter coordinates to continue.'); setLoading(false); return; }
    let disposed = false;
    let frame = 0;
    setError(null);
    setLoading(true);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setClearColor(0x0d0f12);
    element.prepend(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'NASA Moon globe. Drag or use arrow keys to rotate. Use plus and minus to zoom.');
    const scene = new THREE.Scene();
    let stars: Awaited<ReturnType<typeof loadStarfield>> | undefined;
    loadStarfield().then(points => {
      if (disposed) { disposeStarfield(points); return; }
      stars = points;
      scene.add(points);
      draw();
    }).catch(() => { /* The Moon remains usable if the optional background fails. */ });
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 30);
    // OrbitControls caches the up-axis transform at construction.
    camera.up.copy(local && sites[0] ? globePosition(sites[0].lat_deg, sites[0].lon_deg) : new THREE.Vector3(0, 0, -1));
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = false;
    const fittedDistance = () => Math.max(3.5, 1.12 / Math.sin(Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(camera.aspect, 1))));
    const updateLimits = () => {
      const limits = moonZoomLimits(fittedDistance(), local);
      controls.minDistance = limits.min;
      controls.maxDistance = limits.max;
      clampMoonCamera(camera, controls.target, limits.min, limits.max);
    };
    if (local) {
      controls.minPolarAngle = Math.PI / 12;
      controls.maxPolarAngle = Math.PI / 3;
    }
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const light = new THREE.DirectionalLight(0xffffff, 2.6);
    scene.add(light);
    let model: THREE.Group | undefined;
    const raycaster = new THREE.Raycaster();
    const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
    const hit = new THREE.Vector3();
    let pointer: THREE.Vector2 | null = null;
    let pointerPx: { x: number; y: number } | null = null;
    // Layout is read once (resize observer), never per frame.
    const size = { w: element.clientWidth, h: element.clientHeight };
    let lastMotion = 0;
    let lastHover = 0;
    let hoverTimer = 0;
    let lastScale = '';
    let lastScaleWidth = -1;
    const labelWidths = new Map<HTMLElement, { text: string; width: number }>();
    const pinSpot = new WeakMap<HTMLElement, string>(); // keyed by element: a re-created pin must be positioned again
    const render = () => {
      if (disposed) return;
      {
        // Display lighting never supplies the scientific horizon calculation.
        const state = illumination.current;
        const site = sites[0];
        if (local && state && site) {
          const basis = enuBasis(site.lat_deg, site.lon_deg);
          const az = THREE.MathUtils.degToRad(state.sun.azDeg);
          const el = THREE.MathUtils.degToRad(state.sun.elDeg);
          const direction = new THREE.Vector3();
          for (const [axis, weight] of [[basis.east, Math.cos(el) * Math.sin(az)], [basis.north, Math.cos(el) * Math.cos(az)], [basis.up, Math.sin(el)]] as const) {
            direction.addScaledVector(new THREE.Vector3(axis[0], axis[2], -axis[1]), weight);
          }
          light.position.copy(direction).multiplyScalar(10);
        } else light.position.copy(camera.position).applyAxisAngle(camera.up, -0.6).add(new THREE.Vector3(0, 2, 0));
        if (stars) {
          stars.position.copy(camera.position);
          stars.material.uniforms.pixelRatio.value = renderer.getPixelRatio();
        }
        renderer.render(scene, camera);
        if (explorer) {
          // Perspective scale at the facing surface rather than the centre plane.
          const kmPerPixel = 2 * Math.max(0.01, camera.position.length() - 1) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1737.4 / size.h;
          const bar = moonScaleBar(kmPerPixel);
          const scaleText = `${kmFormat.format(bar.km)} km`;
          if (scaleReadout.current && scaleText !== lastScale) { scaleReadout.current.textContent = scaleText; lastScale = scaleText; }
          if (scaleLine.current && Math.abs(bar.pixels - lastScaleWidth) >= 0.5) { scaleLine.current.style.width = `${bar.pixels}px`; lastScaleWidth = bar.pixels; }
          const hoverNow = performance.now();
          if (pointer && hoverReadout.current && hoverNow - lastMotion > 150 && hoverNow - lastHover > 90) {
            lastHover = hoverNow;
            raycaster.setFromCamera(pointer, camera);
            const surface = model ? raycaster.intersectObject(model, true)[0]?.point : raycaster.ray.intersectSphere(sphere, hit);
            const tip = tipReadout.current;
            if (surface) {
              const { lat, lon } = globeCoordinates(surface);
              hoverReadout.current.textContent = `Lat: ${lat.toFixed(4)}°, Lon: ${lon.toFixed(4)}°`;
              if (tip && pick.current && pointerPx) {
                tip.hidden = false;
                tip.textContent = `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`;
                tip.style.transform = `translate(${pointerPx.x + 16}px, ${pointerPx.y + 18}px)`;
              } else if (tip) tip.hidden = true;
            } else {
              hoverReadout.current.textContent = 'Lat: —, Lon: —';
              if (tip) tip.hidden = true;
            }
          } else if (pointer && !hoverTimer) hoverTimer = window.setTimeout(() => { hoverTimer = 0; draw(); }, 100);
        }
        // Markers keep a minimum spacing: a pin that would overlap an earlier one
        // (the selected pin is placed first) moves to the nearest free spot.
        const order = [...positionsRef.current].sort((p, q) => Number(q.id === primaryRef.current) - Number(p.id === primaryRef.current));
        const spots = new Map<string, { x: number; y: number }>();
        const apart = (x: number, y: number) => { for (const spot of spots.values()) if (Math.hypot(spot.x - x, spot.y - y) < MARKER_GAP) return false; return true; };
        for (const { id, point } of order) {
          const pin = pins.current.get(id);
          if (!pin) continue;
          const screen = point.clone().multiplyScalar(1.006).project(camera);
          const visible = point.dot(camera.position.clone().sub(point)) > 0 && Math.abs(screen.x) < 0.95 && Math.abs(screen.y) < 0.95 && screen.z < 1;
          pin.hidden = !visible;
          if (!visible) continue;
          let x = (screen.x + 1) * size.w / 2;
          let y = (1 - screen.y) * size.h / 2;
          if (!apart(x, y)) {
            const [bx, by] = [x, y];
            search: for (let ring = 1; ring <= 6; ring++) for (let step = 0; step < 8; step++) {
              const angle = (step + (ring % 2) / 2) * Math.PI / 4;
              const cx = bx + Math.cos(angle) * MARKER_GAP * ring, cy = by + Math.sin(angle) * MARKER_GAP * ring;
              if (apart(cx, cy)) { x = cx; y = cy; break search; }
            }
          }
          spots.set(id, { x, y });
          const spotKey = `${x.toFixed(1)},${y.toFixed(1)}`;
          if (pinSpot.get(pin) !== spotKey) { pinSpot.set(pin, spotKey); pin.style.left = `${x}px`; pin.style.top = `${y}px`; }
        }
        if (compact && explorer) {
          // Labels avoid every marker dot as well as each other.
          const occupied: { left: number; top: number; right: number; bottom: number }[] = [...spots.values()].map(({ x, y }) => ({ left: x - 10, right: x + 10, top: y - 10, bottom: y + 10 }));
          for (const [id, { x, y }] of spots) {
            const label = pins.current.get(id)?.querySelector<HTMLElement>('.moon-callout-label');
            const leader = pins.current.get(id)?.querySelector('polyline');
            if (!label || !leader) continue;
            let measured = labelWidths.get(label);
            if (!measured || measured.text !== label.textContent) {
              measured = { text: label.textContent ?? '', width: label.offsetWidth };
              if (measured.width > 0) labelWidths.set(label, measured);
            }
            const width = measured.width;
            const direction = x + width + 40 > size.w - 20 ? -1 : 1;
            let rise = 28;
            const left = direction === 1 ? x + 28 : x - 28 - width;
            while (rise < 224 && occupied.some(rect => left < rect.right + 8 && left + width > rect.left - 8 && y - rise - 20 < rect.bottom + 6 && y - rise > rect.top - 6)) rise += 28;
            // Keep labels inside the map at the upper edge, too.
            const endY = y - rise - 20 < 8 ? 28 : -rise;
            const elbow = direction * 28;
            const points = `0,0 ${elbow},${endY} ${elbow + direction * width},${endY}`;
            if (leader.getAttribute('points') !== points) leader.setAttribute('points', points);
            const labelLeft = `${12 + (direction === 1 ? 28 : -28 - width)}px`, labelTop = `${12 + endY - 21}px`;
            if (label.style.left !== labelLeft) label.style.left = labelLeft;
            if (label.style.top !== labelTop) label.style.top = labelTop;
            occupied.push({ left, right: left + width, top: y + endY - 21, bottom: y + endY });
          }
        }
      }
    };
    const draw = () => {
      if (disposed || frame) return;
      frame = requestAnimationFrame(() => { frame = 0; render(); });
    };
    redraw.current = draw;
    focus.current = (id) => {
      zoomTarget = null;
      activeFocus.current = id;
      const point = positionsRef.current.find(p => p.id === id)?.point ?? globePosition(-90, 0);
      const coords = globeCoordinates(point);
      const north = enuBasis(coords.lat, coords.lon).north;
      const northVector = new THREE.Vector3(north[0], north[2], -north[1]);
      if (local) {
        // Anchor to the actual surface so radius normalization cannot bury the camera.
        model?.updateMatrixWorld(true);
        raycaster.set(point.clone().multiplyScalar(2), point.clone().negate());
        const surface = model ? raycaster.intersectObject(model, true)[0]?.point : null;
        controls.target.copy(surface ?? point);
        camera.position.copy(controls.target).addScaledVector(point, 0.09).addScaledVector(northVector, -0.09);
      } else {
        controls.target.set(0, 0, 0);
        camera.position.copy(point).multiplyScalar(fittedDistance());
      }
      updateLimits();
      controls.update();
      draw();
    };
    const markMotion = () => {
      lastMotion = performance.now();
      window.clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(() => { hoverTimer = 0; draw(); }, 170);
    };
    // Zoom eases toward a target distance (in log space, so every wheel tick feels the same at any
    // altitude) and renders once per frame, synchronously, while it moves.
    let zoomTarget: number | null = null;
    let zoomFrame = 0;
    let zoomLast = 0;
    const offset = new THREE.Vector3();
    const stepZoom = (now: number) => {
      zoomFrame = 0;
      if (disposed || zoomTarget === null) return;
      const goal = THREE.MathUtils.clamp(zoomTarget, controls.minDistance, controls.maxDistance);
      const current = camera.position.distanceTo(controls.target);
      const k = 1 - Math.exp(-Math.min(64, now - zoomLast) / ZOOM_TAU_MS);
      zoomLast = now;
      const next = Math.exp(Math.log(current) + (Math.log(goal) - Math.log(current)) * k);
      const done = Math.abs(Math.log(goal / next)) < 0.0004;
      offset.copy(camera.position).sub(controls.target).setLength(done ? goal : next);
      camera.position.copy(controls.target).add(offset);
      markMotion();
      render();
      if (done) zoomTarget = null;
      else zoomFrame = requestAnimationFrame(stepZoom);
    };
    const zoomBy = (factor: number) => {
      zoomTarget = THREE.MathUtils.clamp((zoomTarget ?? camera.position.distanceTo(controls.target)) * factor, controls.minDistance, controls.maxDistance);
      if (!zoomFrame) { zoomLast = performance.now(); zoomFrame = requestAnimationFrame(stepZoom); }
    };
    zoom.current = zoomBy;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation(); // keep OrbitControls' stepped wheel zoom out of the way
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      zoomBy(Math.exp(THREE.MathUtils.clamp(event.deltaY * unit, -240, 240) * 0.0018));
    };
    element.addEventListener('wheel', onWheel, { passive: false, capture: true });
    controls.addEventListener('change', () => { markMotion(); draw(); });
    const onPointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointerPx = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      const tip = tipReadout.current;
      if (tip && !tip.hidden) tip.style.transform = `translate(${pointerPx.x + 16}px, ${pointerPx.y + 18}px)`;
      pointer = new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
      draw();
    };
    let gesture: { x: number; y: number; moved: number; id: number } | null = null;
    let multiplePointers = false;
    const pointers = new Set<number>();
    const onDown = (event: PointerEvent) => {
      pointers.add(event.pointerId);
      if (pointers.size > 1) multiplePointers = true;
      if (event.button === 0 && pointers.size === 1) { multiplePointers = false; gesture = { x: event.clientX, y: event.clientY, moved: 0, id: event.pointerId }; }
    };
    const onMove = (event: PointerEvent) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      gesture.moved += Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
      gesture.x = event.clientX; gesture.y = event.clientY;
    };
    const selectAt = (ndc: THREE.Vector2) => {
      if (!pick.current || !model) return;
      raycaster.setFromCamera(ndc, camera);
      const surface = raycaster.intersectObject(model, true)[0]?.point;
      if (surface) {
        skipFocusUntil.current = performance.now() + 600;
        pick.current(globeCoordinates(surface));
      }
    };
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (!gesture || event.pointerId !== gesture.id) return;
      const tap = !multiplePointers && gesture.moved + Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 5;
      gesture = null;
      if (tap) {
        const bounds = renderer.domElement.getBoundingClientRect();
        selectAt(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2));
      }
    };
    const onCancel = (event: PointerEvent) => { pointers.delete(event.pointerId); gesture = null; };
    const onLeave = () => { pointer = null; pointerPx = null; if (tipReadout.current) tipReadout.current.hidden = true; if (hoverReadout.current) hoverReadout.current.textContent = 'Lat: —, Lon: —'; };
    const onKey = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const rotation = new THREE.Quaternion().setFromUnitVectors(camera.up, new THREE.Vector3(0, 1, 0));
        const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target).applyQuaternion(rotation));
        const amount = Math.PI / 36;
        if (event.key === 'ArrowLeft') spherical.theta -= amount;
        if (event.key === 'ArrowRight') spherical.theta += amount;
        if (event.key === 'ArrowUp') spherical.phi -= amount;
        if (event.key === 'ArrowDown') spherical.phi += amount;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi, Math.max(0.01, controls.minPolarAngle), Math.min(Math.PI - 0.01, controls.maxPolarAngle));
        camera.position.setFromSpherical(spherical).applyQuaternion(rotation.invert()).add(controls.target); controls.update(); draw();
      } else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom.current(0.85); }
      else if (event.key === '-') { event.preventDefault(); zoom.current(1.18); }
      else if (event.key === 'Home') { event.preventDefault(); if (explorer) setOrientation('south'); focus.current(local ? positionsRef.current[0]?.id ?? null : null); }
      else if (event.key === 'Enter' && pick.current) { event.preventDefault(); selectAt(new THREE.Vector2(0, 0)); }
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointercancel', onCancel);
    renderer.domElement.addEventListener('keydown', onKey);
    if (explorer) { element.addEventListener('pointermove', onPointer); element.addEventListener('pointerleave', onLeave); }
    const resize = new ResizeObserver(() => {
      if (!element.clientWidth || !element.clientHeight) return;
      size.w = element.clientWidth;
      size.h = element.clientHeight;
      const previousFit = fittedDistance();
      renderer.setSize(element.clientWidth, element.clientHeight, false);
      camera.aspect = element.clientWidth / element.clientHeight;
      if (explorer && !compact) camera.setViewOffset(element.clientWidth, element.clientHeight, element.clientWidth > 760 ? -element.clientWidth * 0.075 : 0, element.clientWidth <= 760 ? -Math.min(element.clientHeight * 0.08, 50) : 0, element.clientWidth, element.clientHeight);
      else camera.clearViewOffset();
      if (!local) camera.position.multiplyScalar(fittedDistance() / previousFit);
      updateLimits();
      camera.updateProjectionMatrix();
      render(); // before paint, so the resized canvas is never shown empty
    });
    resize.observe(element);
    loadNasaModel('moon').then(loaded => {
      if (disposed) { disposeModel(loaded); return; }
      model = loaded; scene.add(loaded); if (local) focus.current(activeFocus.current); setLoading(false); draw();
    }).catch(() => { if (!disposed) { setLoading(false); setError('Moon model could not load. Enter coordinates to continue.'); } });
    const contextLost = (event: Event) => { event.preventDefault(); setLoading(false); setError('The 3D display was interrupted. Reload to restore it; Planning remains available.'); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    return () => {
      disposed = true;
      focus.current = () => {};
      zoom.current = () => {};
      redraw.current = () => {};
      cancelAnimationFrame(frame);
      cancelAnimationFrame(zoomFrame);
      window.clearTimeout(hoverTimer);
      element.removeEventListener('wheel', onWheel, { capture: true });
      resize.disconnect();
      controls.dispose();
      if (model) disposeModel(model);
      if (stars) disposeStarfield(stars);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      element.removeEventListener('pointermove', onPointer);
      element.removeEventListener('pointerleave', onLeave);
      renderer.domElement.removeEventListener('keydown', onKey);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointercancel', onCancel);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [explorer, local, compact]);

  useEffect(() => { positionsRef.current = positions; redraw.current(); }, [positions]);
  useEffect(() => { if (explorer) focus.current(null); }, [explorer, local, compact]);
  useEffect(() => { if (!explorer || orientation === 'site') focus.current(primaryId); }, [primaryId, sites, explorer, orientation]);
  useEffect(() => {
    if (performance.now() < skipFocusUntil.current) return;
    if (compact && explorer && primaryId) focus.current(primaryId);
  }, [primaryId, compact, explorer]);
  useEffect(() => { redraw.current(); }, [inst]);

  return <>
    <div className={`moon-stage${explorer ? ' moon-stage-full' : ''}${showSites ? '' : ' moon-hide-sites'}${onPick ? ' moon-picking' : ''}`} ref={host}>
      {explorer && !compact ? <div className="moon-simple-controls">
        <label className="moon-sites-toggle"><input type="checkbox" checked={showSites} onChange={event => setShowSites(event.target.checked)} />Landing sites</label>
        {showSites && <ul className="moon-site-list">{sites.map(site => <li key={site.id}><button type="button" aria-pressed={site.id === primaryId} onClick={() => { onSelect(site.id); setOrientation('site'); focus.current(site.id); }}><span>{site.short}</span><small>{COORD_CLASS_LABEL[site.coord_class]}</small></button></li>)}</ul>}
        <button className="btn explorer-button" onClick={() => { setShowSites(true); setOrientation('site'); focus.current(primaryId); }}>Focus site</button>
      </div> :
      <div className="moon-toolbar" hidden={compact && explorer}>
        <button className="btn small" disabled={!local && !primaryId} onClick={() => focus.current(primaryId)}>{local ? 'Reset view' : 'Focus site'}</button>
      </div>}
      {!local && sites.map((site, i) => <button key={site.id} ref={el => { if (el) pins.current.set(site.id, el); else pins.current.delete(site.id); }}
        className={`moon-pin${site.id === primaryId ? ' selected' : ''}${savedSiteIds?.has(site.id) ? ' saved' : ''}`} hidden
        aria-label={savedSiteIds?.has(site.id) ? `Saved scenarios at ${site.lat_deg.toFixed(4)}°, ${site.lon_deg.toFixed(4)}°` : `Select ${site.short}`}
        aria-pressed={site.id === primaryId}
        title={site.short} onClick={() => { onSelect(site.id); if (!compact) focus.current(site.id); }}>
        {compact && explorer ? <>
          <span aria-hidden="true" className="moon-callout-dot" />
          <svg className="moon-leader" aria-hidden="true"><polyline points="0,0 28,-28 112,-28" /></svg>
          <span className="moon-callout-label">{markerLabels?.get(site.id) ?? (site.short === 'Selected location' ? `Site ${i + 1}` : site.short)}</span>
        </> : explorer ? i + 1 : <span aria-hidden="true" className={`planning-site-marker ${site.coord_class}`} />}
      </button>)}
      {loading && <div className="moon-message" role="status">Loading Moon…</div>}
      {error && <div className="moon-message" role="alert">{error}</div>}
      <span className="moon-hint">{onPick ? 'Click to select · Enter selects center · ' : ''}Drag to rotate · Scroll to zoom</span>
      {local && <span className="moon-local-reticle" aria-label="Selected landing site" />}
      {explorer && <output ref={tipReadout} className="moon-tip" hidden aria-hidden="true" />}
      {explorer && <div className="moon-coordinate-hud" aria-label="Moon surface scale and cursor coordinates">
        <output ref={hoverReadout} aria-label="Moon cursor latitude and longitude" aria-live="off">Lat: —, Lon: —</output>
        <div className="moon-scale-bar"><span ref={scaleLine} /><output ref={scaleReadout} aria-label="Moon distance scale" /></div>
      </div>}
      {explorer && <div className="moon-zoom"><button className="btn explorer-button" aria-label="Zoom in on Moon" onClick={() => zoom.current(0.85)}>+</button><button className="btn explorer-button" aria-label="Zoom out from Moon" onClick={() => zoom.current(1.18)}>−</button></div>}
    </div>
  </>;
}
