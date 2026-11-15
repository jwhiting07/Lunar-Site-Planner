import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { landmarkBasis, landmarkTone, type LandingSite, type LandmarkTone } from '../data/landingSites';
import { loadEphemeris } from '../data/loader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { bodyVectorKm, enuBasis, type EphemerisIndex, type InstantState, type SiteDoc, type Vec3 } from '../science';
import { loadNasaModel, disposeModel, smoothMoonLighting } from '../visuals/models';
import { clampMoonCamera, markerOffset, moonZoomLimits } from '../visuals/moonNavigation';
import { COORD_CLASS_LABEL } from '../ui/labels';
import { disposeStarfield, loadStarfield } from '../visuals/stars';

// Body-fixed (X,Y,Z) -> Three (X,Z,-Y), shared with the site's ME coordinates.
// models.ts aligns the native NASA LRO cube-mesh axes with this convention.
const LANDMARK_COLORS: Record<LandmarkTone, [number, number, number]> = { landed: [0.92, 0.92, 0.9], impact: [0.48, 0.52, 0.58], planned: [0.86, 0.68, 0.3] };
const bodyFixedToScene = ([x, y, z]: Vec3) => new THREE.Vector3(x, z, -y);

export function globePosition(lat: number, lon: number): THREE.Vector3 {
  return bodyFixedToScene(enuBasis(lat, lon).up);
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

export function MoonView({ sites, primaryId, onSelect, explorer = false, local = false, inst = null, compact = false, onPick, savedSiteIds, markerLabels, idleRotate = false, landmarks, onLandmark, ephemerisIndex }: {
  sites: SiteDoc[]; primaryId: string; onSelect: (id: string) => void; explorer?: boolean; local?: boolean; inst?: InstantState | null;
  compact?: boolean; onPick?: (point: { lat: number; lon: number }) => void;
  savedSiteIds?: ReadonlySet<string>;
  markerLabels?: ReadonlyMap<string, string>;
  /** Turn the Moon slowly about its axis while nothing is selected and nobody is interacting. */
  idleRotate?: boolean;
  /** Known landing and impact sites drawn as dots (explorer only); clicking one calls onLandmark. */
  landmarks?: LandingSite[]; onLandmark?: (site: LandingSite) => void;
  ephemerisIndex?: EphemerisIndex;
}) {
  const landmarkList = useRef<LandingSite[]>(landmarks ?? []);
  landmarkList.current = landmarks ?? [];
  const landmarkPick = useRef(onLandmark);
  landmarkPick.current = onLandmark;
  const syncLandmarks = useRef(() => {});
  const dotTip = useRef<HTMLDivElement>(null);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const landmarksOn = useRef(true);
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
  const savedRef = useRef(savedSiteIds);
  savedRef.current = savedSiteIds;
  const illumination = useRef(inst);
  illumination.current = inst;
  const applyLiveLighting = useRef<(sun: Vec3, earth: Vec3) => void>(() => {});
  const redraw = useRef(() => {});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSites, setShowSites] = useState(true);
  const [orientation, setOrientation] = useState('south');
  const activeFocus = useRef<string | null>(null);
  const spinEnabled = useRef(idleRotate);
  spinEnabled.current = idleRotate;
  const spinKick = useRef(() => {});
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
    camera.up.copy(local && sites[0] ? globePosition(sites[0].lat_deg, sites[0].lon_deg) : new THREE.Vector3(0, 1, 0));
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
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambient);
    const light = new THREE.DirectionalLight(0xffffff, 2.6);
    scene.add(light);
    let sunDirection: THREE.Vector3 | null = null;
    let earthDirection: THREE.Vector3 | null = null;
    let interacted = false;
    // Known landing sites: one Points draw call, depth-tested against the Moon. Hover and click use
    // screen-space distance to the projected dots (a few dozen points, only on pointer events).
    const dotGeometry = new THREE.BufferGeometry();
    const dotMaterial = new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, depthWrite: false });
    const dots = new THREE.Points(dotGeometry, dotMaterial);
    dots.visible = false;
    dots.renderOrder = 2;
    if (explorer && !local) scene.add(dots);
    let dotPoints: THREE.Vector3[] = [];
    let hoveredDot: LandingSite | null = null;
    let dotTipSize = { w: 0, h: 0 };
    const dotProjected = new THREE.Vector3();
    syncLandmarks.current = () => {
      const list = landmarkList.current;
      dotPoints = list.map(site => globePosition(site.lat_deg, site.lon_deg).multiplyScalar(1.004));
      const position = new Float32Array(list.length * 3), color = new Float32Array(list.length * 3);
      dotPoints.forEach((point, i) => { position.set([point.x, point.y, point.z], i * 3); color.set(LANDMARK_COLORS[landmarkTone(list[i])], i * 3); });
      dotGeometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
      dotGeometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
      dotGeometry.computeBoundingSphere();
      dots.visible = explorer && !local && landmarksOn.current && list.length > 0;
      hoveredDot = null;
      if (dotTip.current) dotTip.current.hidden = true;
      draw();
    };
    const dotAt = (x: number, y: number, preferred?: LandingSite | null): LandingSite | null => {
      if (!dots.visible) return null;
      camera.updateMatrixWorld(); // the camera may have moved since the last frame was rendered
      let best: LandingSite | null = null;
      let bestDistance = 10; // px
      let preferredDistance = Infinity;
      const eye = camera.position;
      for (let i = 0; i < dotPoints.length; i++) {
        const p = dotPoints[i];
        if (p.x * (eye.x - p.x) + p.y * (eye.y - p.y) + p.z * (eye.z - p.z) <= 0) continue; // far side
        dotProjected.copy(p).project(camera);
        if (dotProjected.z >= 1) continue;
        const d = Math.hypot((dotProjected.x + 1) * size.w / 2 - x, (1 - dotProjected.y) * size.h / 2 - y);
        if (landmarkList.current[i] === preferred) preferredDistance = d;
        if (d < bestDistance) { bestDistance = d; best = landmarkList.current[i]; }
      }
      return preferred && preferredDistance < bestDistance + 2 ? preferred : best;
    };
    const placeDotTip = () => {
      const tip = dotTip.current;
      if (!tip || !pointerPx) return;
      const x = Math.min(pointerPx.x + 16, Math.max(8, size.w - dotTipSize.w - 8));
      const y = Math.min(pointerPx.y + 18, Math.max(8, size.h - dotTipSize.h - 8));
      tip.style.transform = `translate(${x}px, ${y}px)`;
    };
    const updateDot = () => {
      const site = pointerPx ? dotAt(pointerPx.x, pointerPx.y, hoveredDot) : null;
      if (site === hoveredDot) { if (site) placeDotTip(); return; }
      hoveredDot = site;
      renderer.domElement.style.cursor = site ? 'pointer' : '';
      const tip = dotTip.current;
      if (!tip) return;
      if (!site) { tip.hidden = true; return; }
      const [name, detail, where, hint] = Array.from(tip.children);
      name.textContent = site.name;
      detail.textContent = `${site.agency} · ${site.date}`;
      where.textContent = `${site.lat_deg.toFixed(Math.min(4, Math.max(2, Math.ceil(-Math.log10(site.precision_deg)))))}°, ${site.lon_deg.toFixed(Math.min(4, Math.max(2, Math.ceil(-Math.log10(site.precision_deg)))))}° E · ${landmarkBasis(site)}`;
      hint.textContent = 'Click to use these coordinates';
      tip.hidden = false;
      dotTipSize = { w: tip.offsetWidth, h: tip.offsetHeight };
      const coordinateTip = tipReadout.current;
      if (coordinateTip) coordinateTip.hidden = true;
      placeDotTip();
    };
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
    const labelWidths = new WeakMap<HTMLElement, { text: string; width: number }>();
    const offsets = new WeakMap<HTMLElement, { x: number; y: number }>();
    const labelPlacement = new WeakMap<HTMLElement, { direction: number; endY: number }>();
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
            direction.addScaledVector(bodyFixedToScene(axis), weight);
          }
          light.position.copy(direction).multiplyScalar(10);
        } else if (sunDirection) {
          light.position.copy(sunDirection).multiplyScalar(10);
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
            updateDot();
            raycaster.setFromCamera(pointer, camera);
            const surface = model ? raycaster.intersectObject(model, true)[0]?.point : raycaster.ray.intersectSphere(sphere, hit);
            const tip = tipReadout.current;
            if (surface) {
              const { lat, lon } = globeCoordinates(surface);
              hoverReadout.current.textContent = `Lat: ${lat.toFixed(4)}°, Lon: ${lon.toFixed(4)}°`;
              if (tip && pick.current && pointerPx && !hoveredDot) {
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
        const priority = (id: string) => Number(id === primaryRef.current) * 2 + Number(savedRef.current?.has(id) ?? false);
        const order = [...positionsRef.current].sort((p, q) => priority(q.id) - priority(p.id) || p.id.localeCompare(q.id));
        const spots = new Map<string, { x: number; y: number }>();
        const apart = (x: number, y: number, gap: number) => { for (const spot of spots.values()) if (Math.hypot(spot.x - x, spot.y - y) < gap) return false; return true; };
        const cameraDirection = camera.position.clone().normalize();
        const limbCos = Math.min(1, 1 / camera.position.length());
        const withinMap = (x: number, y: number) => x >= 14 && x <= size.w - 14 && y >= 14 && y <= size.h - 14;
        for (const { id, point } of order) {
          const pin = pins.current.get(id);
          if (!pin) continue;
          const previousPosition = pin.dataset.position;
          const facing = point.dot(cameraDirection) - limbCos > (previousPosition === 'behind' ? 0.003 : -0.003);
          const screen = point.clone().project(camera);
          const edge = previousPosition === 'offscreen' ? 0.94 : 0.96;
          const onScreen = Math.abs(screen.x) < edge && Math.abs(screen.y) < edge && screen.z < 1;
          const visible = facing && onScreen;
          const keepMarked = compact && explorer && savedRef.current?.has(id);
          pin.hidden = !visible && !keepMarked;
          const position = facing ? (onScreen ? 'surface' : 'offscreen') : 'behind';
          if (previousPosition !== position) {
            pin.dataset.position = position;
            if (position === 'surface') pin.removeAttribute('aria-description');
            else pin.setAttribute('aria-description', position === 'behind' ? 'Behind the visible lunar limb. Activate to center the site.' : 'Outside the current view. Activate to center the site.');
          }
          if (pin.hidden) continue;
          // Keep the bearing of an obscured comparison site at the visible limb.
          if (!facing) {
            const bearing = point.clone().addScaledVector(cameraDirection, -point.dot(cameraDirection));
            if (bearing.lengthSq() < 1e-12) bearing.setFromMatrixColumn(camera.matrixWorld, 0);
            screen.copy(cameraDirection).multiplyScalar(limbCos)
              .addScaledVector(bearing.normalize(), Math.sqrt(1 - limbCos * limbCos)).project(camera);
          }
          let x = (screen.x + 1) * size.w / 2;
          let y = (1 - screen.y) * size.h / 2;
          if (keepMarked) {
            x = THREE.MathUtils.clamp(x, 14, Math.max(14, size.w - 14));
            y = THREE.MathUtils.clamp(y, 14, Math.max(14, size.h - 14));
          }
          const offset = markerOffset({ x, y }, id === primaryRef.current ? undefined : offsets.get(pin),
            (cx, cy, gap) => ((cx === x && cy === y) || withinMap(cx, cy)) && apart(cx, cy, gap));
          offsets.set(pin, offset);
          x += offset.x;
          y += offset.y;
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
            const previous = labelPlacement.get(label);
            const direction = x + width + 40 > size.w - (previous?.direction === -1 ? 32 : 20) ? -1 : 1;
            const left = direction === 1 ? x + 28 : x - 28 - width;
            const fits = (offset: number, gap: number) => {
              const bottom = y + offset;
              return bottom - 21 >= 8 + gap && bottom <= size.h - 8 - gap &&
                !occupied.some(rect => left < rect.right + gap && left + width > rect.left - gap && bottom - 21 < rect.bottom + gap && bottom > rect.top - gap);
            };
            let endY = -28;
            if (!fits(endY, previous && previous.endY !== -28 ? 12 : 6)) {
              if (previous?.direction === direction && fits(previous.endY, 3)) endY = previous.endY;
              else {
                for (let distance = 28; distance <= 224; distance += 28) {
                  if (fits(-distance, 6)) { endY = -distance; break; }
                  if (fits(distance, 6)) { endY = distance; break; }
                }
                if (y + endY - 21 < 8) endY = 28;
              }
            }
            if (previous?.direction !== direction || previous?.endY !== endY) labelPlacement.set(label, { direction, endY });
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
    syncLandmarks.current();
    focus.current = (id) => {
      zoomTarget = null;
      activeFocus.current = id;
      const point = positionsRef.current.find(p => p.id === id)?.point ?? earthDirection ?? globePosition(0, 0);
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
    applyLiveLighting.current = (sun, earth) => {
      const first = earthDirection === null;
      sunDirection = bodyFixedToScene(sun).normalize();
      earthDirection = bodyFixedToScene(earth).normalize();
      ambient.intensity = 0.06;
      if (first && !interacted && !primaryRef.current) focus.current(null);
      else draw();
    };
    // Slow idle spin about the polar axis: pauses on any interaction, resumes after a pause.
    const SPIN_DEG_PER_S = 1.4;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let spinFrame = 0;
    let spinLast = 0;
    let spinResumeAt = 0;
    const spinOffset = new THREE.Vector3();
    const spinTick = (now: number) => {
      spinFrame = 0;
      if (disposed || !spinEnabled.current || reduced) return;
      const dt = Math.min(0.1, (now - spinLast) / 1000);
      spinLast = now;
      if (now >= spinResumeAt && zoomTarget === null) {
        spinOffset.copy(camera.position).sub(controls.target).applyAxisAngle(camera.up, THREE.MathUtils.degToRad(SPIN_DEG_PER_S) * dt);
        camera.position.copy(controls.target).add(spinOffset);
        camera.lookAt(controls.target);
        render();
      }
      spinFrame = requestAnimationFrame(spinTick);
    };
    spinKick.current = () => {
      if (spinFrame || disposed || !spinEnabled.current || reduced) return;
      spinLast = performance.now();
      spinFrame = requestAnimationFrame(spinTick);
    };
    const markMotion = () => {
      lastMotion = performance.now();
      if (hoveredDot) { hoveredDot = null; renderer.domElement.style.cursor = ''; if (dotTip.current) dotTip.current.hidden = true; }
      spinResumeAt = lastMotion + 3500;
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
      interacted = true;
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
    const pauseSpin = () => { interacted = true; spinResumeAt = performance.now() + 3500; };
    element.addEventListener('pointerdown', pauseSpin);
    spinKick.current();
    controls.addEventListener('change', () => { markMotion(); draw(); });
    const onPointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointerPx = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      const tip = tipReadout.current;
      if (tip && !tip.hidden) tip.style.transform = `translate(${pointerPx.x + 16}px, ${pointerPx.y + 18}px)`;
      if (!gesture || gesture.moved < 5) updateDot();
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
        const site = landmarkPick.current ? dotAt(event.clientX - bounds.left, event.clientY - bounds.top, hoveredDot) : null;
        if (site) { skipFocusUntil.current = performance.now() + 600; landmarkPick.current?.(site); return; }
        selectAt(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2));
      }
    };
    const onCancel = (event: PointerEvent) => { pointers.delete(event.pointerId); gesture = null; };
    const onLeave = () => { pointer = null; pointerPx = null; hoveredDot = null; renderer.domElement.style.cursor = ''; if (dotTip.current) dotTip.current.hidden = true; if (tipReadout.current) tipReadout.current.hidden = true; if (hoverReadout.current) hoverReadout.current.textContent = 'Lat: —, Lon: —'; };
    const onKey = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        interacted = true;
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
      if (!local) smoothMoonLighting(loaded);
      model = loaded; scene.add(loaded); if (local) focus.current(activeFocus.current); setLoading(false); draw();
    }).catch(() => { if (!disposed) { setLoading(false); setError('Moon model could not load. Enter coordinates to continue.'); } });
    const contextLost = (event: Event) => { event.preventDefault(); setLoading(false); setError('The 3D display was interrupted. Reload to restore it; Planning remains available.'); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    return () => {
      disposed = true;
      focus.current = () => {};
      applyLiveLighting.current = () => {};
      zoom.current = () => {};
      redraw.current = () => {};
      syncLandmarks.current = () => {};
      dotGeometry.dispose();
      dotMaterial.dispose();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(zoomFrame);
      cancelAnimationFrame(spinFrame);
      spinKick.current = () => {};
      element.removeEventListener('pointerdown', pauseSpin);
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

  useEffect(() => { positionsRef.current = positions; redraw.current(); }, [positions, savedSiteIds]);
  useEffect(() => { spinKick.current(); }, [idleRotate]);
  useEffect(() => { landmarksOn.current = showLandmarks; syncLandmarks.current(); }, [showLandmarks, landmarks]);
  useEffect(() => { if (explorer) focus.current(null); }, [explorer, local, compact]);
  useEffect(() => { if (!explorer || orientation === 'site') focus.current(primaryId); }, [primaryId, sites, explorer, orientation]);
  useEffect(() => {
    if (performance.now() < skipFocusUntil.current) return;
    if (compact && explorer && primaryId) focus.current(primaryId);
  }, [primaryId, compact, explorer]);
  useEffect(() => { redraw.current(); }, [inst]);
  useEffect(() => {
    if (!ephemerisIndex || local) return;
    const start = Date.parse(ephemerisIndex.start_utc);
    const end = Date.parse(ephemerisIndex.stop_utc);
    let disposed = false;
    const refresh = async () => {
      const now = Date.now();
      if (now < start || now >= end) return;
      try {
        const table = await loadEphemeris(ephemerisIndex, now, Math.min(now + 1000, end));
        if (!disposed) applyLiveLighting.current(bodyVectorKm(table, now, 'sun'), bodyVectorKm(table, now, 'earth'));
      } catch { /* Keep fallback display lighting available if the ephemeris fails to load. */ }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [ephemerisIndex, local, explorer, compact]);

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
        aria-label={savedSiteIds?.has(site.id) ? `Saved: ${markerLabels?.get(site.id) ?? site.short}` : `Select ${site.short}`}
        aria-pressed={site.id === primaryId}
        title={site.short} onClick={event => { onSelect(site.id); if (!compact || event.currentTarget.dataset.position !== 'surface') focus.current(site.id); }}>
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
      {explorer && <div ref={dotTip} className="moon-tip moon-dot-tip" hidden aria-hidden="true"><strong /><span /><span /><em /></div>}
      {explorer && !local && landmarks && landmarks.length > 0 && <label className="moon-layer-toggle"><input type="checkbox" checked={showLandmarks} onChange={event => setShowLandmarks(event.target.checked)} />Known landing sites
        {showLandmarks && <span className="moon-legend" aria-hidden="true"><i className="landed" />Landed<i className="impact" />Impact<i className="planned" />Planned</span>}</label>}
      {explorer && <div className="moon-coordinate-hud" aria-label="Moon surface scale and cursor coordinates">
        <output ref={hoverReadout} aria-label="Moon cursor latitude and longitude" aria-live="off">Lat: —, Lon: —</output>
        <div className="moon-scale-bar"><span ref={scaleLine} /><output ref={scaleReadout} aria-label="Moon distance scale" /></div>
      </div>}
      {explorer && <div className="moon-zoom"><button className="btn explorer-button" aria-label="Zoom in on Moon" onClick={() => zoom.current(0.85)}>+</button><button className="btn explorer-button" aria-label="Zoom out from Moon" onClick={() => zoom.current(1.18)}>−</button></div>}
    </div>
  </>;
}
