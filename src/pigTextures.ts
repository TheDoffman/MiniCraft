import * as THREE from 'three';
import pigSkinPng from './assets/textures/mobs/pig_skin.png';
import pigSnoutPng from './assets/textures/mobs/pig_snout.png';
import pigHoofPng from './assets/textures/mobs/pig_hoof.png';

const loader = new THREE.TextureLoader();

function loadMobMap(url) {
  const tex = loader.load(
    url,
    undefined,
    undefined,
    (err) => console.warn('[MiniCraft] Mob texture failed to load:', url, err),
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

/** @type {{ skinMat: THREE.MeshLambertMaterial, snoutMat: THREE.MeshLambertMaterial, hoofMat: THREE.MeshLambertMaterial } | null} */
let _bundle = null;

export function getPigMaterialBundle() {
  if (!_bundle) {
    const skinTex = loadMobMap(pigSkinPng);
    const snoutTex = loadMobMap(pigSnoutPng);
    const hoofTex = loadMobMap(pigHoofPng);
    _bundle = {
      skinMat: new THREE.MeshLambertMaterial({
        map: skinTex,
        flatShading: true,
      }),
      snoutMat: new THREE.MeshLambertMaterial({
        map: snoutTex,
        flatShading: true,
      }),
      hoofMat: new THREE.MeshLambertMaterial({
        map: hoofTex,
        flatShading: true,
      }),
    };
  }
  return _bundle;
}

export function disposePigMaterialBundle() {
  if (!_bundle) return;
  _bundle.skinMat.map?.dispose();
  _bundle.snoutMat.map?.dispose();
  _bundle.hoofMat.map?.dispose();
  _bundle.skinMat.dispose();
  _bundle.snoutMat.dispose();
  _bundle.hoofMat.dispose();
  _bundle = null;
}
