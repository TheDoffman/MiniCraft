import * as THREE from 'three';
import cowHidePng from './assets/textures/mobs/cow_hide.png';
import cowMuzzlePng from './assets/textures/mobs/cow_muzzle.png';
import cowHoofPng from './assets/textures/mobs/cow_hoof.png';
import cowHornPng from './assets/textures/mobs/cow_horn.png';

const loader = new THREE.TextureLoader();

function loadMobMap(url) {
  const tex = loader.load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

/** @type {{ hideMat: THREE.MeshLambertMaterial, muzzleMat: THREE.MeshLambertMaterial, hoofMat: THREE.MeshLambertMaterial, hornMat: THREE.MeshLambertMaterial } | null} */
let _bundle = null;

export function getCowMaterialBundle() {
  if (!_bundle) {
    _bundle = {
      hideMat: new THREE.MeshLambertMaterial({
        map: loadMobMap(cowHidePng),
        flatShading: true,
      }),
      muzzleMat: new THREE.MeshLambertMaterial({
        map: loadMobMap(cowMuzzlePng),
        flatShading: true,
      }),
      hoofMat: new THREE.MeshLambertMaterial({
        map: loadMobMap(cowHoofPng),
        flatShading: true,
      }),
      hornMat: new THREE.MeshLambertMaterial({
        map: loadMobMap(cowHornPng),
        flatShading: true,
      }),
    };
  }
  return _bundle;
}

export function disposeCowMaterialBundle() {
  if (!_bundle) return;
  for (const k of ['hideMat', 'muzzleMat', 'hoofMat', 'hornMat']) {
    const m = _bundle[k];
    m.map?.dispose();
    m.dispose();
  }
  _bundle = null;
}
