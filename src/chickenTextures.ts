import * as THREE from 'three';

function makeMobTexture(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  size = 32,
) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context');
  draw(ctx, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

/** @type {{ bodyMat: THREE.MeshLambertMaterial; combMat: THREE.MeshLambertMaterial; beakMat: THREE.MeshLambertMaterial; legMat: THREE.MeshLambertMaterial } | null} */
let _bundle: {
  bodyMat: THREE.MeshLambertMaterial;
  combMat: THREE.MeshLambertMaterial;
  beakMat: THREE.MeshLambertMaterial;
  legMat: THREE.MeshLambertMaterial;
} | null = null;

export function getChickenMaterialBundle() {
  if (!_bundle) {
    const bodyTex = makeMobTexture((ctx, w, h) => {
      ctx.fillStyle = 'rgb(168,118,72)';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (((x * 11 + y * 13) % 19) < 4) {
            ctx.fillStyle = 'rgb(148,98,58)';
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    });
    const combTex = makeMobTexture((ctx, w, h) => {
      ctx.fillStyle = 'rgb(200,48,48)';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (((x + y) & 2) === 0) {
            ctx.fillStyle = 'rgb(160,32,40)';
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    });
    const beakTex = makeMobTexture((ctx, w, h) => {
      ctx.fillStyle = 'rgb(240,200,72)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgb(200,160,48)';
      ctx.fillRect(0, Math.floor(h * 0.5), w, Math.ceil(h * 0.5));
    });
    const legTex = makeMobTexture((ctx, w, h) => {
      ctx.fillStyle = 'rgb(220,140,48)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgb(180,100,32)';
      ctx.fillRect(0, 0, w, Math.floor(h * 0.35));
    });
    _bundle = {
      bodyMat: new THREE.MeshLambertMaterial({ map: bodyTex, flatShading: true }),
      combMat: new THREE.MeshLambertMaterial({ map: combTex, flatShading: true }),
      beakMat: new THREE.MeshLambertMaterial({ map: beakTex, flatShading: true }),
      legMat: new THREE.MeshLambertMaterial({ map: legTex, flatShading: true }),
    };
  }
  return _bundle;
}

export function disposeChickenMaterialBundle() {
  if (!_bundle) return;
  _bundle.bodyMat.map?.dispose();
  _bundle.combMat.map?.dispose();
  _bundle.beakMat.map?.dispose();
  _bundle.legMat.map?.dispose();
  _bundle.bodyMat.dispose();
  _bundle.combMat.dispose();
  _bundle.beakMat.dispose();
  _bundle.legMat.dispose();
  _bundle = null;
}
