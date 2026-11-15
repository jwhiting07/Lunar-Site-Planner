import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { OrbitBody } from './orbits';

const moonLighting = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
  'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
  `float incidence = dot( geometryNormal, directLight.direction );
   float width = 0.035;
   float ramp = clamp( ( incidence + width ) / ( 2.0 * width ), 0.0, 1.0 );
   float dotNL = max( incidence - width, 0.0 ) + width * ramp * ramp;`,
);

/** Each caller owns its model and GPU resources; HTTP cache reuses the local GLB. */
export async function loadNasaModel(body: OrbitBody): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/${body}.glb`);
  const source = gltf.scene;
  const box = new THREE.Box3().setFromObject(source);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) / 2;
  source.position.sub(centre);
  const normalized = new THREE.Group();
  normalized.add(source);
  normalized.scale.setScalar(1 / radius);
  // NASA LRO cube mesh: physical ME (X,Y,Z) = (-local Z,-local X,local Y).
  // Align with the existing site-marker convention Three (X,Z,-Y).
  if (body === 'moon') normalized.rotation.y = -Math.PI / 2;
  const root = new THREE.Group();
  root.add(normalized);
  source.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.metalness = 0;
      material.roughness = 1;
      if (material.map) material.map.anisotropy = 4;
      if (body === 'sun') {
        material.emissive.set(0xffffff);
        material.emissiveIntensity = 1;
        material.toneMapped = false;
      }
    }
  });
  return root;
}

export function smoothMoonLighting(root: THREE.Object3D) {
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    // Radial normals stay continuous across the Moon model's duplicated UV edges.
    const positions = node.geometry.getAttribute('position');
    const normals = new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3);
    const localCentre = node.worldToLocal(new THREE.Vector3());
    const radial = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      radial.fromBufferAttribute(positions, i).sub(localCentre).normalize();
      normals.setXYZ(i, radial.x, radial.y, radial.z);
    }
    node.geometry.setAttribute('normal', normals);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.onBeforeCompile = shader => {
        // Round the diffuse falloff within roughly two degrees of the terminator.
        shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', moonLighting);
      };
    }
  });
}

export function disposeModel(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      material.dispose();
    }
  });
  textures.forEach(texture => texture.dispose());
}
