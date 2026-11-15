import * as THREE from 'three';

/** Camera distances are in normalized Moon radii, shared by every zoom input. */
export function moonZoomLimits(fittedDistance: number, local = false) {
  return local ? { min: 0.025, max: 0.3 } : { min: 1.4, max: Math.min(15, Math.max(4, fittedDistance * 1.6)) };
}

export function clampMoonCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3, min: number, max: number) {
  const offset = camera.position.clone().sub(target);
  const distance = offset.length();
  if (distance === 0) offset.set(0, 0, min);
  else offset.multiplyScalar(THREE.MathUtils.clamp(distance, min, max) / distance);
  camera.position.copy(target).add(offset);
}

interface ScreenPoint { x: number; y: number }
const MARKER_GAP = 22;
const AT_ANCHOR = { x: 0, y: 0 };
const MARKER_OFFSETS = Array.from({ length: 48 }, (_, i) => {
  const ring = Math.floor(i / 8) + 1;
  const angle = (i % 8 + (ring % 2) / 2) * Math.PI / 4;
  return { x: Math.cos(angle) * MARKER_GAP * ring, y: Math.sin(angle) * MARKER_GAP * ring };
});

/** Leave a displaced pin in place until its true anchor has extra room. */
export function markerOffset(anchor: ScreenPoint, previous: ScreenPoint | undefined, fits: (x: number, y: number, gap: number) => boolean): ScreenPoint {
  const displaced = previous && previous !== AT_ANCHOR;
  if (fits(anchor.x, anchor.y, MARKER_GAP + (displaced ? 8 : 0))) return AT_ANCHOR;
  if (displaced && fits(anchor.x + previous.x, anchor.y + previous.y, MARKER_GAP - 3)) return previous;
  if (fits(anchor.x, anchor.y, MARKER_GAP)) return AT_ANCHOR;
  return MARKER_OFFSETS.find(offset => fits(anchor.x + offset.x, anchor.y + offset.y, MARKER_GAP)) ?? AT_ANCHOR;
}
