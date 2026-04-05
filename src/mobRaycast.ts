/**
 * Distance along ray (dir unit) to enter AABB, or null.
 */
export function rayAabbEnterDistance(ox, oy, oz, dx, dy, dz, min, max, maxDist) {
  let t0 = 0;
  let t1 = maxDist;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    const di = d[i];
    const oi = o[i];
    const mn = min[i];
    const mx = max[i];
    if (Math.abs(di) < 1e-10) {
      if (oi < mn - 1e-6 || oi > mx + 1e-6) return null;
      continue;
    }
    const inv = 1 / di;
    let ta = (mn - oi) * inv;
    let tb = (mx - oi) * inv;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  if (t1 < 0) return null;
  const enter = t0 >= 0 ? t0 : 0;
  return enter <= maxDist ? enter : null;
}
