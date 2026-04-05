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

/** @type {{ woolMat: THREE.MeshLambertMaterial; faceMat: THREE.MeshLambertMaterial; hoofMat: THREE.MeshLambertMaterial } | null} */
let _bundle: {
  woolMat: THREE.MeshLambertMaterial;
  faceMat: THREE.MeshLambertMaterial;
  hoofMat: THREE.MeshLambertMaterial;
} | null = null;

export function getSheepMaterialBundle() {
  if (!_bundle) {
    const woolTex = makeMobTexture((ctx, w, h) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const n = ((x * 13 + y * 17) % 23) / 23;
          const g = 218 + Math.floor(n * 32);
          const b = Math.min(255, g + 6 + ((x + y) % 3));
          ctx.fillStyle = `rgb(${g},${g},${b})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });
    const faceTex = makeMobTexture((ctx, w, h) => {
      ctx.fillStyle = 'rgb(92,62,48)';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (((x + y * 3) & 3) === 0) {
            ctx.fillStyle = 'rgb(78,52,40)';
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
      ctx.fillStyle = 'rgb(180,120,110)';
      ctx.fillRect(Math.floor(w * 0.35), Math.floor(h * 0.45), Math.floor(w * 0.3), Math.floor(h * 0.22));
    });
    const hoofTex = makeMobTexture((ctx, w, h) => {
      ctx.fillStyle = 'rgb(42,38,36)';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (((x * 5 + y * 7) & 7) === 0) {
            ctx.fillStyle = 'rgb(28,26,24)';
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    });
    _bundle = {
      woolMat: new THREE.MeshLambertMaterial({ map: woolTex, flatShading: true }),
      faceMat: new THREE.MeshLambertMaterial({ map: faceTex, flatShading: true }),
      hoofMat: new THREE.MeshLambertMaterial({ map: hoofTex, flatShading: true }),
    };
  }
  return _bundle;
}

export function disposeSheepMaterialBundle() {
  if (!_bundle) return;
  _bundle.woolMat.map?.dispose();
  _bundle.faceMat.map?.dispose();
  _bundle.hoofMat.map?.dispose();
  _bundle.woolMat.dispose();
  _bundle.faceMat.dispose();
  _bundle.hoofMat.dispose();
  _bundle = null;
}
