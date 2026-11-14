import { memo, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { enuDirection, terrainNodeEnu, type InstantState, type SiteDoc } from '../science';
import { loadTerrain } from '../data/loader';
import { TERRAIN_CAPTION, num } from '../ui/labels';
import { Panel } from './Common';

interface Rig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  terrain: THREE.Group;
  north: THREE.Group;
  sunLight: THREE.DirectionalLight;
  sunArrow: THREE.ArrowHelper;
  earthArrow: THREE.ArrowHelper;
  requestRender: () => void;
  resetCamera: () => void;
}

const ARROW_LEN = 14;
const PIN_H = 1.2;
const SUN_COLOR = 0xf0b43c;
const EARTH_COLOR = 0x3cc4de;

/** ENU (east, north, up) to Three (x = east, y = up, z = -north). */
const toThree = (e: number, n: number, u: number): THREE.Vector3 => new THREE.Vector3(e, u, -n);

function makeLabelSprite(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#d7dbe0';
    g.font = 'bold 44px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 32, 34);
  }
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(3.2, 3.2, 1);
  sp.renderOrder = 10;
  return sp;
}

function disposeObject(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh | THREE.Line | THREE.Sprite;
    if ('geometry' in m && m.geometry) m.geometry.dispose();
    const mat = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const x of mats) {
      (x as THREE.SpriteMaterial).map?.dispose();
      x.dispose();
    }
  });
}

function TerrainViewImpl({ site, inst }: { site: SiteDoc; inst: InstantState | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<Rig | null>(null);
  const [vScale, setVScale] = useState<1 | 3>(1);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [statusMsg, setStatusMsg] = useState('');
  const [glFail, setGlFail] = useState<string | null>(null);

  // Renderer, scene, camera, controls: created once per mount.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (err) {
      setGlFail(err instanceof Error ? err.message : String(err));
      return;
    }
    setGlFail(null);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x0d0f12);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 600);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.minDistance = 1.5;
    controls.maxDistance = 100;
    controls.maxPolarAngle = Math.PI * 0.53;

    let raf = 0;
    const requestRender = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        renderer.render(scene, camera);
      });
    };
    const resetCamera = () => {
      camera.position.set(0, 13, 34);
      controls.target.set(0, 0, 0);
      controls.update();
      requestRender();
    };

    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const sunLight = new THREE.DirectionalLight(0xfff3dd, 0);
    sunLight.position.set(0, 100, 0);
    scene.add(sunLight, sunLight.target);

    const terrain = new THREE.Group();
    scene.add(terrain);

    // Site pin.
    const pin = new THREE.Group();
    const pinMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    pin.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, PIN_H, 0)]), pinMat));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    head.position.y = PIN_H;
    pin.add(head);
    scene.add(pin);

    const origin = new THREE.Vector3(0, PIN_H, 0);
    const mkArrow = (color: number) => {
      const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, ARROW_LEN, color, 1.8, 0.9);
      for (const part of [a.line, a.cone]) {
        const m = part.material as THREE.Material;
        m.depthTest = false;
        part.renderOrder = 5;
      }
      scene.add(a);
      return a;
    };
    const sunArrow = mkArrow(SUN_COLOR);
    const earthArrow = mkArrow(EARTH_COLOR);

    const north = new THREE.Group();
    const nArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -19), 4.5, 0xc9ced4, 1.3, 0.8);
    (nArrow.line.material as THREE.Material).depthTest = false;
    (nArrow.cone.material as THREE.Material).depthTest = false;
    const nLabel = makeLabelSprite('N');
    nLabel.position.set(0, 0, -25);
    north.add(nArrow, nLabel);
    scene.add(north);

    const onChange = () => requestRender();
    controls.addEventListener('change', onChange);
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      requestRender();
    });
    ro.observe(host);

    rigRef.current = { renderer, scene, camera, controls, terrain, north, sunLight, sunArrow, earthArrow, requestRender, resetCamera };
    resetCamera();

    return () => {
      rigRef.current = null;
      ro.disconnect();
      controls.removeEventListener('change', onChange);
      controls.dispose();
      if (raf) cancelAnimationFrame(raf);
      sunArrow.dispose();
      earthArrow.dispose();
      nArrow.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  // Recentre the camera when the site changes.
  useEffect(() => {
    rigRef.current?.resetCamera();
  }, [site.id]);

  // Terrain mesh: rebuilt only when the site or the vertical factor changes (never on scrub).
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    let cancelled = false;
    setStatus('loading');
    loadTerrain(site)
      .then((heights) => {
        if (cancelled) return;
        const { n, half_width_m: half, spacing_m: spacing } = site.terrain;
        const pos = new Float32Array(n * n * 3);
        let maxUp = 0;
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            const east = -half + i * spacing;
            const north = -half + j * spacing;
            const k = j * n + i;
            const full = terrainNodeEnu(east, north, heights[k], site.elevation_m);
            const base = terrainNodeEnu(east, north, 0, site.elevation_m);
            // Exaggerate only the relief above the curved reference surface.
            const e = base[0] + vScale * (full[0] - base[0]);
            const nn = base[1] + vScale * (full[1] - base[1]);
            const u = base[2] + vScale * (full[2] - base[2]);
            pos[3 * k] = e / 1000;
            pos[3 * k + 1] = u / 1000;
            pos[3 * k + 2] = -nn / 1000;
            if (u / 1000 > maxUp) maxUp = u / 1000;
          }
        }
        const idx = new Uint32Array((n - 1) * (n - 1) * 6);
        let p = 0;
        for (let j = 0; j < n - 1; j++) {
          for (let i = 0; i < n - 1; i++) {
            const a = j * n + i;
            const b = a + 1;
            const c = a + n;
            const d = c + 1;
            idx[p++] = a; idx[p++] = b; idx[p++] = c;
            idx[p++] = b; idx[p++] = d; idx[p++] = c;
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ color: 0x9a9da1, roughness: 1, metalness: 0, flatShading: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        rig.terrain.add(mesh);
        rig.north.position.y = maxUp + 0.8;
        setStatus('ready');
        rig.requestRender();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setStatusMsg(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      for (const child of [...rig.terrain.children]) {
        rig.terrain.remove(child);
        disposeObject(child);
      }
    };
  }, [site, vScale]);

  // Sun light and direction arrows follow the cursor time.
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig || !inst) return;
    const s = enuDirection(inst.sun.azDeg, inst.sun.elDeg);
    const e = enuDirection(inst.earth.azDeg, inst.earth.elDeg);
    const sv = toThree(s[0], s[1], s[2]).normalize();
    const ev = toThree(e[0], e[1], e[2]).normalize();
    rig.sunLight.position.copy(sv).multiplyScalar(100);
    rig.sunLight.intensity = 2.8 * inst.sun.diskFraction;
    rig.sunArrow.setDirection(sv);
    rig.earthArrow.setDirection(ev);
    rig.requestRender();
  }, [inst]);

  const halfKm = site.terrain.half_width_m;
  const far = (name: string, distM: number): string | null =>
    distM > halfKm ? `Horizon toward ${name} set by terrain ${num(distM / 1000, 0)} km away — outside this view` : null;
  const notes = inst ? [far('Sun', inst.sun.horizonDistM), far('Earth', inst.earth.horizonDistM)].filter((x): x is string => !!x) : [];

  return (
    <Panel
      title="3-D terrain view"
      help="Terrain around the site from the LOLA elevation model, lit from the true Sun direction at the cursor time. Drag to orbit, scroll to zoom."
      className="terrain-panel"
      right={
        <span className="panel-tools">
          <span className="vtoggle" role="group" aria-label="Vertical exaggeration">
            <span className="field-label">Vertical</span>
            {([1, 3] as const).map((v) => (
              <button key={v} type="button" className={vScale === v ? 'seg on' : 'seg'} aria-pressed={vScale === v} onClick={() => setVScale(v)}>
                {'×'}{v}
              </button>
            ))}
          </span>
          <button type="button" className="btn small" onClick={() => rigRef.current?.resetCamera()}>
            Reset view
          </button>
        </span>
      }
    >
      <div className="terrain-wrap">
        <div ref={hostRef} className="terrain-host" aria-label="3-D terrain view" role="img" />
        {glFail && (
          <div className="overlay-msg" role="alert">
            3-D view unavailable: WebGL could not be initialised ({glFail}). All numbers and the sky view still work.
          </div>
        )}
        {!glFail && status === 'loading' && <div className="overlay-msg">Loading terrain{'…'}</div>}
        {!glFail && status === 'error' && <div className="overlay-msg err" role="alert">Terrain failed to load: {statusMsg}</div>}
        <div className="terrain-legend">
          <span><i className="lg lg-sun" /> toward Sun</span>
          <span><i className="lg lg-earth" /> toward Earth</span>
          <span>Vertical {'×'}{vScale}{vScale === 1 ? ' (true scale)' : ' (exaggerated)'}</span>
        </div>
        {notes.length > 0 && (
          <div className="terrain-notes">
            {notes.map((t) => (
              <div key={t}>{t}</div>
            ))}
          </div>
        )}
      </div>
      <p className="caption">{TERRAIN_CAPTION}</p>
    </Panel>
  );
}

export const TerrainView = memo(TerrainViewImpl);
