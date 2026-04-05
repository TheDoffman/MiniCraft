import * as THREE from 'three';
import zombiePng from './assets/textures/mobs/zombie.png';

const loader = new THREE.TextureLoader();

let _bundle = null;

export function getZombieMaterialBundle() {
  if (_bundle) return _bundle;
  const tex = loader.load(
    zombiePng,
    undefined,
    undefined,
    (err) => console.warn('[MiniCraft] Mob texture failed to load:', zombiePng, err),
  );
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = true;
  tex.needsUpdate = true;
  const bodyMat = new THREE.MeshLambertMaterial({ map: tex });
  _bundle = { bodyMat, tex };
  return _bundle;
}

export function disposeZombieMaterialBundle() {
  if (!_bundle) return;
  _bundle.bodyMat.dispose();
  _bundle.tex.dispose();
  _bundle = null;
}
