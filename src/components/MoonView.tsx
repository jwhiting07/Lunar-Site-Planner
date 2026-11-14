import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { enuBasis, type SiteDoc } from '../science';
import { loadNasaModel, disposeModel } from '../visuals/models';

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

export function MoonView({ sites, primaryId, onSelect, explorer = false }: {
  sites: SiteDoc[]; primaryId: string; onSelect: (id: string) => void; explorer?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const pins = useRef(new Map<string, HTMLButtonElement>());
  const focus = useRef<(id: string | null) => void>(() => {});
  const zoom = useRef<(factor: number) => void>(() => {});
  const hoverReadout = useRef<HTMLOutputElement>(null);
  const scaleReadout = useRef<HTMLOutputElement>(null);
  const scaleLine = useRef<HTMLSpanElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSites, setShowSites] = useState(!explorer);
  const [orientation, setOrientation] = useState('near');

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setError('3-D unavailable. Select a site from the list; analysis still works.'); setLoading(false); return; }
    let disposed = false;
    let frame = 0;
    setError(null);
    setLoading(true);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setClearColor(0x0d0f12);
    element.prepend(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'NASA Moon globe. Drag or use arrow keys to rotate. Use plus and minus to zoom, Home to reset.');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 30);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 1.3;
    controls.maxDistance = 6;
    controls.enableDamping = false;
    const fittedDistance = () => Math.max(3.5, 1.12 / Math.sin(Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(camera.aspect, 1))));
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const light = new THREE.DirectionalLight(0xffffff, 2.6);
    scene.add(light);
    let model: THREE.Group | undefined;
    const positions = sites.map(site => ({ id: site.id, point: globePosition(site.lat_deg, site.lon_deg) }));
    const raycaster = new THREE.Raycaster();
    const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
    const hit = new THREE.Vector3();
    let pointer: THREE.Vector2 | null = null;
    const draw = () => {
      if (disposed || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Fixed viewing light: context only, never used for illumination calculations.
        light.position.copy(camera.position).applyAxisAngle(camera.up, -0.6).add(new THREE.Vector3(0, 2, 0));
        renderer.render(scene, camera);
        if (explorer) {
          const kmPerPixel = 2 * camera.position.distanceTo(controls.target) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1737.4 / element.clientHeight;
          const bar = moonScaleBar(kmPerPixel);
          if (scaleReadout.current) scaleReadout.current.textContent = `${new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 }).format(bar.km)} km`;
          if (scaleLine.current) scaleLine.current.style.width = `${bar.pixels}px`;
          if (pointer && hoverReadout.current) {
            raycaster.setFromCamera(pointer, camera);
            if (raycaster.ray.intersectSphere(sphere, hit)) {
              const { lat, lon } = globeCoordinates(hit);
              hoverReadout.current.textContent = `Lat: ${lat.toFixed(4)}°, Lon: ${lon.toFixed(4)}°`;
            } else hoverReadout.current.textContent = 'Lat: —, Lon: —';
          }
        }
        for (const { id, point } of positions) {
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
    focus.current = (id) => {
      const point = id === 'far' ? globePosition(0, 180) : positions.find(p => p.id === id)?.point ?? globePosition(0, 0);
      camera.position.copy(point).multiplyScalar(fittedDistance());
      controls.target.set(0, 0, 0);
      controls.update();
      draw();
    };
    zoom.current = (factor) => {
      camera.position.multiplyScalar(Math.max(controls.minDistance, Math.min(controls.maxDistance, camera.position.length() * factor)) / camera.position.length());
      controls.update(); draw();
    };
    controls.addEventListener('change', draw);
    const onPointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer = new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
      draw();
    };
    const onLeave = () => { pointer = null; if (hoverReadout.current) hoverReadout.current.textContent = 'Lat: —, Lon: —'; };
    const onKey = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const spherical = new THREE.Spherical().setFromVector3(camera.position);
        const amount = Math.PI / 36;
        if (event.key === 'ArrowLeft') spherical.theta -= amount;
        if (event.key === 'ArrowRight') spherical.theta += amount;
        if (event.key === 'ArrowUp') spherical.phi = Math.max(0.01, spherical.phi - amount);
        if (event.key === 'ArrowDown') spherical.phi = Math.min(Math.PI - 0.01, spherical.phi + amount);
        camera.position.setFromSpherical(spherical); controls.update(); draw();
      } else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom.current(0.85); }
      else if (event.key === '-') { event.preventDefault(); zoom.current(1.18); }
      else if (event.key === 'Home') { event.preventDefault(); focus.current(null); }
    };
    renderer.domElement.addEventListener('keydown', onKey);
    if (explorer) { renderer.domElement.addEventListener('pointermove', onPointer); renderer.domElement.addEventListener('pointerleave', onLeave); }
    const resize = new ResizeObserver(() => {
      if (!element.clientWidth || !element.clientHeight) return;
      const previousFit = fittedDistance();
      renderer.setSize(element.clientWidth, element.clientHeight, false);
      camera.aspect = element.clientWidth / element.clientHeight;
      controls.maxDistance = Math.max(6, fittedDistance() * 1.7);
      if (explorer) camera.setViewOffset(element.clientWidth, element.clientHeight, element.clientWidth > 760 ? -element.clientWidth * 0.075 : 0, element.clientWidth <= 760 ? -Math.min(element.clientHeight * 0.08, 50) : 0, element.clientWidth, element.clientHeight);
      else camera.clearViewOffset();
      camera.position.multiplyScalar(fittedDistance() / previousFit);
      camera.updateProjectionMatrix();
      draw();
    });
    resize.observe(element);
    loadNasaModel('moon').then(loaded => {
      if (disposed) { disposeModel(loaded); return; }
      model = loaded; scene.add(loaded); setLoading(false); draw();
    }).catch(() => { if (!disposed) { setLoading(false); setError('NASA Moon model could not load. The site list and Planning remain available.'); } });
    const contextLost = (event: Event) => { event.preventDefault(); setLoading(false); setError('The 3D display was interrupted. Reload to restore it; Planning remains available.'); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    return () => {
      disposed = true;
      focus.current = () => {};
      zoom.current = () => {};
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      if (model) disposeModel(model);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      renderer.domElement.removeEventListener('pointermove', onPointer);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      renderer.domElement.removeEventListener('keydown', onKey);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [sites, explorer]);

  useEffect(() => { focus.current(explorer ? null : primaryId); }, [sites, explorer]); // Initial view, independent of marker selection.
  useEffect(() => { if (!explorer || orientation === 'site') focus.current(primaryId); }, [primaryId, sites, explorer, orientation]);

  return <>
    <div className={`moon-stage${explorer ? ' moon-stage-full' : ''}${showSites ? '' : ' moon-hide-sites'}`} ref={host}>
      {explorer ? <div className="moon-simple-controls">
        <label className="sr-only" htmlFor="moon-orientation">Moon view</label>
        <select id="moon-orientation" value={orientation} onChange={event => { setOrientation(event.target.value); focus.current(event.target.value === 'site' ? primaryId : event.target.value === 'far' ? 'far' : null); }}>
          <option value="near">Near side</option><option value="far">Far side</option><option value="site">Selected landing site</option>
        </select>
        <label className="moon-sites-toggle"><input type="checkbox" checked={showSites} onChange={event => setShowSites(event.target.checked)} />Landing sites</label>
        {showSites && <><label className="sr-only" htmlFor="moon-site">Landing site</label><select id="moon-site" value={primaryId} onChange={event => { onSelect(event.target.value); setOrientation('site'); focus.current(event.target.value); }}>{sites.map(site => <option key={site.id} value={site.id}>{site.short}</option>)}</select></>}
        <button className="btn explorer-button" onClick={() => { setOrientation('near'); focus.current(null); }}>Reset view</button>
      </div> :
      <div className="moon-toolbar">
        <button className="btn small" onClick={() => focus.current(primaryId)}>Focus site</button>
        <button className="btn small" onClick={() => focus.current(null)}>Near side</button>
      </div>}
      {sites.map((site, i) => <button key={site.id} ref={el => { if (el) pins.current.set(site.id, el); else pins.current.delete(site.id); }}
        className={`moon-pin${site.id === primaryId ? ' selected' : ''}`} hidden
        aria-label={`Select ${site.short}`} aria-pressed={site.id === primaryId}
        title={site.short} onClick={() => { onSelect(site.id); setOrientation('site'); focus.current(site.id); }}>{i + 1}</button>)}
      {loading && <div className="moon-message" role="status">Loading Moon…</div>}
      {error && <div className="moon-message" role="alert">{error}</div>}
      <span className="moon-hint">Drag to rotate · Scroll to zoom</span>
      {explorer && <div className="moon-coordinate-hud" aria-label="Moon surface scale and cursor coordinates"><div className="moon-scale-bar" title="Approximate distance scale at globe center; scale varies across a perspective sphere."><span ref={scaleLine} /><output ref={scaleReadout} aria-label="Moon distance scale" /></div><output ref={hoverReadout} aria-label="Moon cursor latitude and longitude" aria-live="off">Lat: —, Lon: —</output></div>}
      {explorer && <div className="moon-zoom"><button className="btn explorer-button" aria-label="Zoom in on Moon" onClick={() => zoom.current(0.85)}>+</button><button className="btn explorer-button" aria-label="Zoom out from Moon" onClick={() => zoom.current(1.18)}>−</button></div>}
    </div>
    {!explorer && <p className="caption moon-credit">Model: <a href="https://svs.gsfc.nasa.gov/14959/" target="_blank" rel="noreferrer">NASA GSFC / LRO</a>. Context globe with viewing light; use the horizon chart for illumination.</p>}
  </>;
}
