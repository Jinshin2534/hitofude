// 平面幾何の小道具。座標は {x, y}。

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

/** 連続する同一点(と極端に近い点)を除く */
export function dedupe(pts, minGap = 1e-6) {
  const out = [];
  for (const p of pts) {
    if (!out.length || dist(out[out.length - 1], p) > minGap) out.push({ x: p.x, y: p.y });
  }
  return out;
}

/** Ramer–Douglas–Peucker。両端は必ず残す。 */
export function simplify(pts, eps) {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1;
    let bestD = eps;
    for (let i = a + 1; i < b; i++) {
      const d = projectOnSegment(pts[i], pts[a], pts[b]).d;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** 点 p から線分 ab への最近点。t は ab 上の位置(0..1)。 */
export function projectOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { t, point, d: dist(p, point) };
}

/** 線分 p1p2 と p3p4 の交点。平行・交わらないときは null。 */
export function segmentIntersection(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return null;
  const ex = p3.x - p1.x;
  const ey = p3.y - p1.y;
  const t = (ex * d2y - ey * d2x) / den;
  const u = (ex * d1y - ey * d1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, point: { x: p1.x + t * d1x, y: p1.y + t * d1y } };
}

export function bbox(pts, pad = 0) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

export const bboxOverlap = (a, b) =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

/** 折れ線を先頭から長さ len のところまで切り出す */
export function partialPolyline(pts, len) {
  if (len <= 0) return [pts[0]];
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (acc + d >= len) {
      const t = d === 0 ? 0 : (len - acc) / d;
      out.push({ x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y) });
      return out;
    }
    acc += d;
    out.push(pts[i]);
  }
  return out;
}

/** 折れ線の長さ方向のちょうど半分の点 */
export function midpoint(pts) {
  const p = partialPolyline(pts, polylineLength(pts) / 2);
  return p[p.length - 1];
}
