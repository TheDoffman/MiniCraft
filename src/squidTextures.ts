import * as THREE from 'three';
import squidMantlePng from './assets/textures/mobs/squid_mantle.png';
import squidTentaclePng from './assets/textures/mobs/squid_tentacle.png';

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

/** @type {{ mantleMat: THREE.MeshLambertMaterial, tentacleMat: THREE.MeshLambertMaterial } | null} */
let _bundle = null;

export function getSquidMaterialBundle() {
  if (!_bundle) {
    _bundle = {
      mantleMat: new THREE.MeshLambertMaterial({
        map: loadMobMap(squidMantlePng),
        flatShading: true,
      }),
      tentacleMat: new THREE.MeshLambertMaterial({
        map: loadMobMap(squidTentaclePng),
        flatShading: true,
      }),
    };
  }
  return _bundle;
}

export function disposeSquidMaterialBundle() {
  if (!_bundle) return;
  for (const k of ['mantleMat', 'tentacleMat']) {
    const m = _bundle[k];
    m.map?.dispose();
    m.dispose();
  }
  _bundle = null;
}
