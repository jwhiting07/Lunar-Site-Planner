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
