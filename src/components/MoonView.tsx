import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { enuBasis, type SiteDoc } from '../science';

// Body-fixed (X,Y,Z) -> Three (X,Z,-Y). NASA's texture has 0° at u=0.5.
// SphereGeometry's u=0.5 is +X, with east-positive longitude toward -Z.
export function globePosition(lat: number, lon: number): THREE.Vector3 {
  const [x, y, z] = enuBasis(lat, lon).up;
  return new THREE.Vector3(x, z, -y);
}

export function MoonView({ sites, primaryId, onSelect }: {
  sites: SiteDoc[]; primaryId: string; onSelect: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const pins = useRef(new Map<string, HTMLButtonElement>());
  const focus = useRef<(id: string | null) => void>(() => {});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 30);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 1.3;
    controls.maxDistance = 6;
    controls.enableDamping = false;
    const fittedDistance = () => Math.max(3.2, 1.1 / Math.sin(Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(camera.aspect, 1))));
    const geometry = new THREE.SphereGeometry(1, 96, 64);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, bumpScale: 0.012 });
    scene.add(new THREE.Mesh(geometry, material));
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    scene.add(light);
    const positions = sites.map(site => ({ id: site.id, point: globePosition(site.lat_deg, site.lon_deg) }));
    const draw = () => {
      if (disposed || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Fixed viewing light: context only, never used for illumination calculations.
        light.position.copy(camera.position).add(new THREE.Vector3(-2, 2, 1));
        renderer.render(scene, camera);
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
      const point = positions.find(p => p.id === id)?.point ?? globePosition(0, 0);
      camera.position.copy(point).multiplyScalar(fittedDistance());
      controls.target.set(0, 0, 0);
      controls.update();
      draw();
    };
    controls.addEventListener('change', draw);
    const resize = new ResizeObserver(() => {
      if (!element.clientWidth || !element.clientHeight) return;
      const previousFit = fittedDistance();
      renderer.setSize(element.clientWidth, element.clientHeight, false);
      camera.aspect = element.clientWidth / element.clientHeight;
      camera.position.multiplyScalar(fittedDistance() / previousFit);
      camera.updateProjectionMatrix();
      draw();
    });
    resize.observe(element);
    const textures: THREE.Texture[] = [];
    const loader = new THREE.TextureLoader();
    for (const [name, file] of [['map', 'moon-color.jpg'], ['bumpMap', 'moon-bump.jpg']] as const) {
      const texture = loader.load(`${import.meta.env.BASE_URL}textures/${file}`, loaded => {
        if (disposed) { loaded.dispose(); return; }
        if (name === 'map') { loaded.colorSpace = THREE.SRGBColorSpace; setLoading(false); }
        material[name] = loaded;
        material.needsUpdate = true;
        draw();
      }, undefined, () => {
        if (!disposed) { setLoading(false); setError('Moon texture could not load. Site markers and analysis remain available.'); }
      });
      textures.push(texture);
    }
    return () => {
      disposed = true;
      focus.current = () => {};
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      textures.forEach(texture => texture.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [sites]);

  useEffect(() => { focus.current(primaryId); }, [primaryId, sites]);

  return <>
    <div className="moon-stage" ref={host}>
      <div className="moon-toolbar">
        <button className="btn small" onClick={() => focus.current(primaryId)}>Focus site</button>
        <button className="btn small" onClick={() => focus.current(null)}>Near side</button>
      </div>
      {sites.map((site, i) => <button key={site.id} ref={el => { if (el) pins.current.set(site.id, el); else pins.current.delete(site.id); }}
        className={`moon-pin${site.id === primaryId ? ' selected' : ''}`} hidden
        aria-label={`Select ${site.short}`} aria-pressed={site.id === primaryId}
        title={site.short} onClick={() => onSelect(site.id)}>{i + 1}</button>)}
      {loading && <div className="moon-message" role="status">Loading Moon…</div>}
      {error && <div className="moon-message" role="alert">{error}</div>}
      <span className="moon-hint">Drag to orbit · Scroll to zoom</span>
    </div>
    <p className="caption moon-credit">Imagery: <a href="https://svs.gsfc.nasa.gov/4720/" target="_blank" rel="noreferrer">NASA’s Scientific Visualization Studio</a>. Context globe with viewing light; use the horizon chart for illumination.</p>
  </>;
}
