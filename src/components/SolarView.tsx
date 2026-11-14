import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createOrbitLayout, futureTimes, loadOrbits, metersPerPixel, orbitOrientation, sixMonthsAfter, type OrbitBody } from '../visuals/orbits';
import { disposeModel, loadNasaModel } from '../visuals/models';
import { UtcClock } from './UtcClock';

const BODIES: OrbitBody[] = ['sun', 'earth', 'moon'];
const NAMES = { sun: 'Sun', earth: 'Earth', moon: 'Moon' };
const RADII = { sun: 0.19, earth: 0.075, moon: 0.024 };
const scaleNumber = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 });

export default function SolarView({ onMoon }: { onMoon: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<Partial<Record<OrbitBody, HTMLElement>>>({});
  const popup = useRef<HTMLDivElement>(null);
  const [scales, setScales] = useState<Partial<Record<OrbitBody, number>>>({});
  const [scaleOpen, setScaleOpen] = useState(false);
  const [status, setStatus] = useState<string | null>('Loading NASA models…');
  const [error, setError] = useState(false);
  const [limited, setLimited] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setError(true); setStatus('3D is unavailable in this browser. Moon site data and Planning are still accessible.'); return; }
    let disposed = false, ready = false;
    const owned: THREE.Object3D[] = [];
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 30);
    const viewDirection = new THREE.Vector3(Math.sin(Math.PI / 15) * Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), Math.cos(Math.PI / 15) * Math.cos(Math.PI / 6));
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), viewDirection).normalize();
    const up = new THREE.Vector3().crossVectors(viewDirection, right).normalize();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x0d0f12);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    element.prepend(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.28));
    const light = new THREE.PointLight(0xffffff, 3, 0, 0);
    scene.add(light); // At the Sun, inverse-square falloff disabled in schematic display units.
    const contextLost = (event: Event) => { event.preventDefault(); setError(true); setStatus('The 3D display was interrupted. Reload this page to restore it; Planning remains available.'); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    let redraw = () => {};
    const resize = new ResizeObserver(() => redraw());
    resize.observe(element);
    const loading = Promise.allSettled([loadOrbits(), ...BODIES.map(loadNasaModel)]);
    loading.then(results => {
      const failure = results.find(result => result.status === 'rejected');
      if (disposed || failure) {
        results.slice(1).forEach(result => { if (result.status === 'fulfilled') disposeModel(result.value as THREE.Group); });
        if (!disposed) { setError(true); setStatus(`Could not load the solar view. ${failure?.status === 'rejected' ? String(failure.reason) : ''}`); }
        return;
      }
      const data = (results[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof loadOrbits>>>).value;
      const epoch = Date.now();
      if (epoch < data.t0 || epoch > data.end) {
        results.slice(1).forEach(result => disposeModel((result as PromiseFulfilledResult<THREE.Group>).value));
        setError(true); setStatus('Current time is outside the supplied orbit data (2026–2028 UTC). Planning supports that recorded interval.'); return;
      }
      const layout = createOrbitLayout(data, epoch);
      const models = Object.fromEntries(BODIES.map((body, i) => {
        const model = (results[i + 1] as PromiseFulfilledResult<THREE.Group>).value;
        model.scale.setScalar(RADII[body]); scene.add(model); owned.push(model);
        return [body, model];
      })) as Record<OrbitBody, THREE.Group>;
      const lines = (['earth', 'moon'] as const).map(body => {
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.LineDashedMaterial({ color: body === 'earth' ? 0x747c85 : 0x505861, dashSize: 0.012, gapSize: 0.009, transparent: true, opacity: 0.75 });
        const line = new THREE.Line(geometry, material);
        scene.add(line);
        return { body, line };
      });
      const fitWidth = layout.position(epoch, 'earth').dot(right) / (2 / 3 - 0.18);
      let width = 0, height = 0;
      redraw = () => {
        if (disposed || document.hidden || !element.clientWidth || !element.clientHeight) return;
        const now = Date.now();
        if (now < data.t0 || now > data.end) { setError(true); setStatus('Current time is outside orbital data coverage.'); return; }
        if (width !== element.clientWidth || height !== element.clientHeight) {
          width = element.clientWidth; height = element.clientHeight;
          renderer.setSize(width, height, false);
          // Responsive framing, with Earth at 2/3 width and Sun at 18%.
          const viewWidth = fitWidth;
          const viewHeight = viewWidth * height / width;
          camera.left = -viewWidth / 2; camera.right = viewWidth / 2;
          camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
          const target = right.clone().multiplyScalar(viewWidth * 0.32).addScaledVector(up, -viewHeight * 0.045);
          camera.position.copy(target).addScaledVector(viewDirection, 7);
          camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
          setScales(Object.fromEntries(BODIES.map(body => [body, metersPerPixel(data.index.radii_km[body], RADII[body] * 2 / viewWidth * width)])));
        }
        const times = futureTimes(data, now);
        for (const { body, line } of lines) {
          line.geometry.dispose();
          line.geometry = new THREE.BufferGeometry().setFromPoints(times.map(time => layout.position(time, body)));
          line.computeLineDistances();
        }
        for (const body of BODIES) {
          const model = models[body];
          model.position.copy(layout.position(now, body));
          if (body !== 'sun') {
            // NASA GLB local axes are Y-up; transform the display orientation only.
            model.quaternion.copy(layout.frame).multiply(orbitOrientation(data, now, body))
              .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
          }
          const label = labels.current[body];
          if (label) {
            const point = model.position.clone().addScaledVector(right, RADII[body] + 0.025).project(camera);
            label.style.left = `${(point.x + 1) * 50}%`;
            label.style.top = `${(1 - point.y) * 50}%`;
            label.hidden = false;
          }
        }
        renderer.render(scene, camera);
      };
      const disposeLines = () => lines.forEach(({ line }) => { line.geometry.dispose(); line.material.dispose(); });
      cleanupLines = disposeLines;
      ready = true; setStatus(null); setLimited(sixMonthsAfter(epoch) > data.end); redraw();
    }).catch(reason => { if (!disposed) { setError(true); setStatus(String(reason)); } });
    let cleanupLines = () => {};
    const tick = window.setInterval(() => { if (ready) redraw(); }, 1000);
    const onVisibility = () => redraw();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true; clearInterval(tick); resize.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      cleanupLines(); owned.forEach(disposeModel); renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  return <main className="solar-page">
    <div className="solar-stage" ref={host} role="img" aria-label="Fixed-camera 3D Sun, Earth and Moon with future-only six-month trajectories. Body sizes, lunar separation and far-side orbital spacing are exaggerated.">
      {BODIES.map(body => body === 'moon'
        ? <button key={body} hidden ref={el => { labels.current[body] = el ?? undefined; }} className="body-label body-link" onClick={onMoon}>Moon</button>
        : <span key={body} hidden ref={el => { labels.current[body] = el ?? undefined; }} className="body-label">{NAMES[body]}</span>)}
    </div>
    {status && <div className="explorer-message" role={error ? 'alert' : 'status'}>{status}{error && <button className="btn" onClick={() => location.reload()}>Reload</button>}</div>}
    <footer className="solar-bottom">
      <div className="scale-anchor">
        <button type="button" className="btn explorer-button" aria-expanded={scaleOpen} aria-controls="solar-scale" onClick={() => scaleOpen ? popup.current?.hidePopover() : popup.current?.showPopover()}>Scale</button>
        <div popover="auto" id="solar-scale" ref={popup} className="scale-popover" onToggle={event => setScaleOpen(event.newState === 'open')}>
          <dl>{BODIES.map(body => <div key={body}><dt>{NAMES[body]}</dt><dd>{scales[body] ? `${scaleNumber.format(scales[body]!)} m/px` : 'Unavailable'}</dd></div>)}</dl>
          <p>Body diameter scale · CSS pixels</p>
          <details><summary>Sources & display</summary><p>NASA models, with <a href="https://science.nasa.gov/learn/heat/resource/sun-3d-model/" target="_blank" rel="noreferrer">Sun</a>, <a href="https://science.nasa.gov/learn/heat/resource/earth-3d-model/" target="_blank" rel="noreferrer">Earth</a> and <a href="https://svs.gsfc.nasa.gov/14959/" target="_blank" rel="noreferrer">LRO Moon</a> imagery. Precomputed NASA/JPL SPICE DE440 positions, interpolated to current UTC. Surface maps are static, not live photographs.</p><p>Body sizes and lunar separation are enlarged independently. The far side of the orbit is compressed to fit. These scales describe body diameters, not distances between bodies. Solar view is a schematic overview; use Planning for site calculations.</p></details>
          {limited && <p role="status">Future paths stop at the data boundary, 1 Jan 2029 UTC.</p>}
        </div>
      </div>
      <UtcClock />
    </footer>
  </main>;
}
