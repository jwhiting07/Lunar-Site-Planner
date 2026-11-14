import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clampMoonCamera, moonZoomLimits } from './moonNavigation';
import { globePosition } from '../components/MoonView';
import type { SitesDoc } from '../science';

const sites = (JSON.parse(readFileSync('public/data/sites.json', 'utf8')) as SitesDoc).sites;

describe('bounded Moon navigation', () => {
  it('caps near and far zoom relative to the local site target', () => {
    for (const local of [false, true]) {
      const { min, max } = moonZoomLimits(3.5, local);
      const target = local ? globePosition(-85.4, 31.5) : new THREE.Vector3();
      const camera = new THREE.PerspectiveCamera();
      for (const distance of [0.0001, 0.1, 2, 100]) {
        camera.position.copy(target).add(new THREE.Vector3(0, 0, distance));
        clampMoonCamera(camera, target, min, max);
        expect(camera.position.distanceTo(target)).toBeCloseTo(THREE.MathUtils.clamp(distance, min, max), 10);
      }
    }
  });

  it('keeps local orbiting above the surface for every shipped site and both zoom limits', () => {
    for (const { lat_deg: lat, lon_deg: lon } of sites) {
      const camera = new THREE.PerspectiveCamera();
      const up = globePosition(lat, lon);
      camera.up.copy(up);
      const controls = new OrbitControls(camera, null);
      controls.target.copy(up);
      controls.minPolarAngle = Math.PI / 12;
      controls.maxPolarAngle = Math.PI / 3;
      const limits = moonZoomLimits(3.5, true);
      controls.minDistance = limits.min;
      controls.maxDistance = limits.max;
      for (const distance of [0.0001, 100]) {
        camera.position.copy(up).addScaledVector(up, -distance);
        controls.update();
        const offset = camera.position.clone().sub(controls.target);
        expect(offset.length()).toBeGreaterThanOrEqual(limits.min - 1e-10);
        expect(offset.length()).toBeLessThanOrEqual(limits.max + 1e-10);
        expect(offset.clone().normalize().dot(up)).toBeGreaterThanOrEqual(0.5 - 1e-10);
        expect(camera.position.length()).toBeGreaterThan(1);
      }
      // No DOM was connected, so there are no event listeners to dispose.
    }
  });
});
