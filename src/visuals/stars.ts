import * as THREE from 'three';

type Star = [ra: number, dec: number, magnitude: number];
let catalog: Promise<{ stars: Star[] }> | undefined;

/** Actual catalog positions, with deliberately restrained display brightness. */
export async function loadStarfield() {
  catalog ??= fetch(`${import.meta.env.BASE_URL}data/stars.json`).then(response => {
    if (!response.ok) throw new Error(`Star catalog failed to load: ${response.status}`);
    return response.json() as Promise<{ stars: Star[] }>;
  }).catch(error => { catalog = undefined; throw error; });
  const { stars } = await catalog;
  const positions = new Float32Array(stars.length * 3);
  const brightness = new Float32Array(stars.length);
  for (const [index, [ra, dec, magnitude]] of stars.entries()) {
    const lon = THREE.MathUtils.degToRad(ra);
    const lat = THREE.MathUtils.degToRad(dec);
    positions.set([20 * Math.cos(lat) * Math.cos(lon), 20 * Math.sin(lat), -20 * Math.cos(lat) * Math.sin(lon)], index * 3);
    brightness[index] = THREE.MathUtils.clamp((5.8 - magnitude) / 7.3, 0, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('brightness', new THREE.BufferAttribute(brightness, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: 1 } },
    vertexShader: `
      attribute float brightness;
      uniform float pixelRatio;
      varying float vStarLuminance;
      void main() {
        vStarLuminance = 0.11 + 0.5 * pow(brightness, 0.8);
        gl_PointSize = (1.1 + 1.2 * brightness) * pixelRatio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying float vStarLuminance;
      void main() {
        float radius = length(gl_PointCoord - 0.5) * 2.0;
        float edge = fwidth(radius);
        float coverage = 1.0 - smoothstep(0.65 - edge, 0.65 + edge, radius);
        gl_FragColor = vec4(vec3(vStarLuminance), coverage);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

export function disposeStarfield(points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>) {
  points.geometry.dispose();
  points.material.dispose();
}
