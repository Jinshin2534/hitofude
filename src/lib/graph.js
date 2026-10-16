// 手描きの線(ストローク)から「点と線」のグラフを起こす。
//
// 点になるのは、線の端・線どうしの交点・線の端が別の線に触れた所(T字)。
// snap 以内に集まった候補はひとつの点にまとめる。点と点のあいだの線が「辺」。
import {
  bbox,
  bboxOverlap,
  dedupe,
  dist,
  polylineLength,
  projectOnSegment,
  segmentIntersection,
  simplify,
} from './geometry.js';

export const DEFAULT_SNAP = 18;

/**
 * @param {Array<Array<{x:number,y:number}>>} strokes
 * @param {{snap?: number}} opts
 * @returns {{vertices: {id:number,x:number,y:number}[], edges: {id:number,u:number,v:number,path:{x:number,y:number}[],length:number}[], snap:number, ignored:number}}
 */
export function buildGraph(strokes, opts = {}) {
  const r = opts.snap ?? DEFAULT_SNAP;
  const lines = [];
  let ignored = 0;
  for (const s of strokes) {
    const l = simplify(dedupe(s), 1);
    // 点を打っただけ・ごく短い線は線とみなさない
    if (l.length < 2 || polylineLength(l) < r) {
      if (s.length) ignored++;
      continue;
    }
    lines.push(l);
  }

  const boxes = lines.map((l) => bbox(l, r));
  const cum = lines.map((l) => {
    const c = [0];
    for (let i = 1; i < l.length; i++) c.push(c[i - 1] + dist(l[i - 1], l[i]));
    return c;
  });
  /** cuts[i] = 線 i を切る位置 {s: 線分番号+t, p: 座標, id: 通し番号} */
  const cuts = lines.map(() => []);
  const all = [];
  const addCut = (i, s, p) => {
    const c = { s, p, id: all.length };
    all.push(c);
    cuts[i].push(c);
  };

  // 1. 端点
  lines.forEach((l, i) => {
    addCut(i, 0, l[0]);
    addCut(i, l.length - 1, l[l.length - 1]);
  });

  // 2. 交点(自分自身との交差も含む)
  for (let i = 0; i < lines.length; i++) {
    for (let j = i; j < lines.length; j++) {
      if (i !== j && !bboxOverlap(boxes[i], boxes[j])) continue;
      const A = lines[i];
      const B = lines[j];
      for (let a = 0; a < A.length - 1; a++) {
        for (let b = i === j ? a + 2 : 0; b < B.length - 1; b++) {
          const hit = segmentIntersection(A[a], A[a + 1], B[b], B[b + 1]);
          if (!hit) continue;
          addCut(i, a + hit.t, hit.point);
          addCut(j, b + hit.u, hit.point);
        }
      }
    }
  }

  // 3. T字: 線の端が別の線(または自分の離れた所)の途中に触れている
  for (let i = 0; i < lines.length; i++) {
    const A = lines[i];
    const ends = [
      { p: A[0], at: 0 },
      { p: A[A.length - 1], at: cum[i][A.length - 1] },
    ];
    for (const e of ends) {
      for (let j = 0; j < lines.length; j++) {
        const B = lines[j];
        let best = null;
        for (let b = 0; b < B.length - 1; b++) {
          const pr = projectOnSegment(e.p, B[b], B[b + 1]);
          if (pr.d >= r) continue;
          if (i === j) {
            const along = cum[j][b] + pr.t * dist(B[b], B[b + 1]);
            if (Math.abs(along - e.at) < 2 * r) continue;
          }
          if (!best || pr.d < best.d) best = { d: pr.d, s: b + pr.t, point: pr.point };
        }
        if (best) addCut(j, best.s, best.point);
      }
    }
  }

  // 4. snap 以内の候補をまとめて点にする
  const parent = all.map((_, k) => k);
  const find = (k) => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  for (let a = 0; a < all.length; a++) {
    for (let b = a + 1; b < all.length; b++) {
      if (dist(all[a].p, all[b].p) < r) parent[find(a)] = find(b);
    }
  }
  const groups = new Map();
  for (const c of all) {
    const root = find(c.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(c);
  }
  const rawVertex = new Map();
  const rawPos = [];
  for (const [root, members] of groups) {
    rawVertex.set(root, rawPos.length);
    rawPos.push({
      x: members.reduce((s, c) => s + c.p.x, 0) / members.length,
      y: members.reduce((s, c) => s + c.p.y, 0) / members.length,
    });
  }
  const vOf = (c) => rawVertex.get(find(c.id));

  // 5. 点と点のあいだを辺にする
  const rawEdges = [];
  lines.forEach((l, i) => {
    const cs = cuts[i].slice().sort((a, b) => a.s - b.s);
    for (let k = 0; k + 1 < cs.length; k++) {
      const a = cs[k];
      const b = cs[k + 1];
      if (b.s - a.s < 1e-9) continue;
      const u = vOf(a);
      const v = vOf(b);
      const path = [rawPos[u]];
      for (let q = Math.floor(a.s) + 1; q < b.s; q++) path.push(l[q]);
      path.push(rawPos[v]);
      const length = polylineLength(path);
      // 同じ点に戻るだけの短い切れ端は、点をまとめたときのゴミ
      if (u === v && length < 3 * r) continue;
      rawEdges.push({ u, v, path: dedupe(path), length });
    }
  });

  // 辺のない点を除いて番号を振り直す
  const used = new Map();
  const vertices = [];
  const idOf = (raw) => {
    if (!used.has(raw)) {
      used.set(raw, vertices.length);
      vertices.push({ id: vertices.length, x: rawPos[raw].x, y: rawPos[raw].y });
    }
    return used.get(raw);
  };
  const edges = rawEdges.map((e, id) => ({ id, u: idOf(e.u), v: idOf(e.v), path: e.path, length: e.length }));
  return { vertices, edges, snap: r, ignored };
}

/**
 * 「つながっていないかもしれない」端: 線が1本だけの点で、ほかの線まで snap〜2.5×snap しか離れていないもの。
 * 判定はつながっていない前提で行うので、そのことを画面で正直に伝えるために使う。
 */
export function findNearMisses(graph) {
  const r = graph.snap;
  const deg = new Array(graph.vertices.length).fill(0);
  for (const e of graph.edges) {
    deg[e.u]++;
    deg[e.v]++;
  }
  const out = [];
  for (const v of graph.vertices) {
    if (deg[v.id] !== 1) continue;
    let best = null;
    for (const e of graph.edges) {
      if (e.u === v.id || e.v === v.id) continue;
      for (let k = 0; k + 1 < e.path.length; k++) {
        const pr = projectOnSegment(v, e.path[k], e.path[k + 1]);
        if (!best || pr.d < best.d) best = { d: pr.d, point: pr.point };
      }
    }
    if (best && best.d < 2.5 * r) out.push({ vertex: v.id, d: best.d, point: best.point });
  }
  return out;
}
