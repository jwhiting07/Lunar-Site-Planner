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

export function MoonView({ sites, primaryId, onSelect, explorer = false, local = false, inst = null, compact = false, onPick, savedSiteIds }: {
  sites: SiteDoc[]; primaryId: string; onSelect: (id: string) => void; explorer?: boolean; local?: boolean; inst?: InstantState | null;
  compact?: boolean; onPick?: (point: { lat: number; lon: number }) => void;
  savedSiteIds?: ReadonlySet<string>;
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
  const scaleReadout = useRef<HTMLOutputElement>(null);
  const scaleLine = useRef<HTMLSpanElement>(null);
  const illumination = useRef(inst);
  illumination.current = inst;
  const redraw = useRef(() => {});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSites, setShowSites] = useState(true);
  const [orientation, setOrientation] = useState('south');
  const activeFocus = useRef<string | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
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
    const draw = () => {
      if (disposed || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
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
          const kmPerPixel = 2 * Math.max(0.01, camera.position.length() - 1) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1737.4 / element.clientHeight;
          const bar = moonScaleBar(kmPerPixel);
          if (scaleReadout.current) scaleReadout.current.textContent = `${new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 }).format(bar.km)} km`;
          if (scaleLine.current) scaleLine.current.style.width = `${bar.pixels}px`;
          if (pointer && hoverReadout.current) {
            raycaster.setFromCamera(pointer, camera);
            const surface = model ? raycaster.intersectObject(model, true)[0]?.point : raycaster.ray.intersectSphere(sphere, hit);
            if (surface) {
              const { lat, lon } = globeCoordinates(surface);
              hoverReadout.current.textContent = `Lat: ${lat.toFixed(4)}°, Lon: ${lon.toFixed(4)}°`;
            } else hoverReadout.current.textContent = 'Lat: —, Lon: —';
          }
        }
        for (const { id, point } of positionsRef.current) {
          const pin = pins.current.get(id);
          if (!pin) continue;
          const screen = point.clone().multiplyScalar(1.006).project(camera);
          const visible = point.dot(camera.position.clone().sub(point)) > 0 && Math.abs(screen.x) < 0.95 && Math.abs(screen.y) < 0.95 && screen.z < 1;
          pin.hidden = !visible;
          pin.style.left = `${(screen.x + 1) * 50}%`;
          pin.style.top = `${(1 - screen.y) * 50}%`;
        }
      });
    };
    redraw.current = draw;
    focus.current = (id) => {
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
    zoom.current = (factor) => {
      camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
      updateLimits();
      controls.update(); draw();
    };
    controls.addEventListener('change', draw);
    const onPointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
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
      if (surface) pick.current(globeCoordinates(surface));
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
    const onLeave = () => { pointer = null; if (hoverReadout.current) hoverReadout.current.textContent = 'Lat: —, Lon: —'; };
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
    if (explorer) { renderer.domElement.addEventListener('pointermove', onPointer); renderer.domElement.addEventListener('pointerleave', onLeave); }
    const resize = new ResizeObserver(() => {
      if (!element.clientWidth || !element.clientHeight) return;
      const previousFit = fittedDistance();
      renderer.setSize(element.clientWidth, element.clientHeight, false);
      camera.aspect = element.clientWidth / element.clientHeight;
      if (explorer && !compact) camera.setViewOffset(element.clientWidth, element.clientHeight, element.clientWidth > 760 ? -element.clientWidth * 0.075 : 0, element.clientWidth <= 760 ? -Math.min(element.clientHeight * 0.08, 50) : 0, element.clientWidth, element.clientHeight);
      else camera.clearViewOffset();
      if (!local) camera.position.multiplyScalar(fittedDistance() / previousFit);
      updateLimits();
      camera.updateProjectionMatrix();
      draw();
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
      resize.disconnect();
      controls.dispose();
      if (model) disposeModel(model);
      if (stars) disposeStarfield(stars);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      renderer.domElement.removeEventListener('pointermove', onPointer);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
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
  useEffect(() => { redraw.current(); }, [inst]);

  return <>
    <div className={`moon-stage${explorer ? ' moon-stage-full' : ''}${showSites ? '' : ' moon-hide-sites'}`} ref={host}>
      {explorer && !compact ? <div className="moon-simple-controls">
        <label className="moon-sites-toggle"><input type="checkbox" checked={showSites} onChange={event => setShowSites(event.target.checked)} />Landing sites</label>
        {showSites && <ul className="moon-site-list">{sites.map(site => <li key={site.id}><button type="button" aria-pressed={site.id === primaryId} onClick={() => { onSelect(site.id); setOrientation('site'); focus.current(site.id); }}><span>{site.short}</span><small>{COORD_CLASS_LABEL[site.coord_class]}</small></button></li>)}</ul>}
        <button className="btn explorer-button" onClick={() => { setShowSites(true); setOrientation('site'); focus.current(primaryId); }}>Focus site</button>
      </div> :
      <div className="moon-toolbar">
        <button className="btn small" disabled={!local && !primaryId} onClick={() => focus.current(primaryId)}>{local ? 'Reset view' : 'Focus site'}</button>
      </div>}
      {!local && sites.map((site, i) => <button key={site.id} ref={el => { if (el) pins.current.set(site.id, el); else pins.current.delete(site.id); }}
        className={`moon-pin${site.id === primaryId ? ' selected' : ''}${savedSiteIds?.has(site.id) ? ' saved' : ''}`} hidden
        aria-label={savedSiteIds?.has(site.id) ? `Saved scenarios at ${site.lat_deg.toFixed(4)}°, ${site.lon_deg.toFixed(4)}°` : `Select ${site.short}`}
        aria-pressed={site.id === primaryId}
        title={site.short} onClick={() => { onSelect(site.id); if (!compact) focus.current(site.id); }}>
        {explorer && !compact ? i + 1 : <span aria-hidden="true" className={`planning-site-marker ${site.coord_class}`} />}
      </button>)}
      {loading && <div className="moon-message" role="status">Loading Moon…</div>}
      {error && <div className="moon-message" role="alert">{error}</div>}
      <span className="moon-hint">{onPick ? 'Click to select · Enter selects center · ' : ''}Drag to rotate · Scroll to zoom</span>
      {local && <span className="moon-local-reticle" aria-label="Selected landing site" />}
      {explorer && <div className="moon-coordinate-hud" aria-label="Moon surface scale and cursor coordinates">
        <output ref={hoverReadout} aria-label="Moon cursor latitude and longitude" aria-live="off">Lat: —, Lon: —</output>
        <div className="moon-scale-bar"><span ref={scaleLine} /><output ref={scaleReadout} aria-label="Moon distance scale" /></div>
      </div>}
      {explorer && <div className="moon-zoom"><button className="btn explorer-button" aria-label="Zoom in on Moon" onClick={() => zoom.current(0.85)}>+</button><button className="btn explorer-button" aria-label="Zoom out from Moon" onClick={() => zoom.current(1.18)}>−</button></div>}
    </div>
  </>;
}
