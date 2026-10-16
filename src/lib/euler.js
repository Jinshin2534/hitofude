// オイラー路(一筆書き)まわりの純粋関数。グラフは { vertices:[{id,x,y}], edges:[{id,u,v,path?}] }。
// 多重辺・自己ループ(輪)を許す。輪は点の次数を2増やす。
import { dist } from './geometry.js';

export function degrees(g) {
  const deg = new Array(g.vertices.length).fill(0);
  for (const e of g.edges) {
    deg[e.u]++;
    deg[e.v]++;
  }
  return deg;
}

/** 辺を持つ点だけで連結成分を求める。返り値は点 id の配列の配列。 */
export function components(g) {
  const n = g.vertices.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (k) => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  for (const e of g.edges) parent[find(e.u)] = find(e.v);
  const deg = degrees(g);
  const map = new Map();
  for (let v = 0; v < n; v++) {
    if (deg[v] === 0) continue;
    const root = find(v);
    if (!map.has(root)) map.set(root, []);
    map.get(root).push(v);
  }
  return [...map.values()];
}

/**
 * 一筆書きできるかの判定。
 * kind: 'empty' | 'circuit'(奇数点0、始点=終点) | 'path'(奇数点2) | 'impossible'
 * minStrokes: このままなら最少何筆で書けるか(成分ごとに max(1, 奇数点/2) の和)
 * minAdditions: 一筆で書けるようにするのに足す線の最少本数(= minStrokes - 1)
 */
export function analyze(g) {
  const deg = degrees(g);
  const comps = components(g);
  const odd = [];
  deg.forEach((d, v) => {
    if (d % 2 === 1) odd.push(v);
  });
  const oddSet = new Set(odd);
  const oddPerComp = comps.map((c) => c.filter((v) => oddSet.has(v)).length);
  const minStrokes = oddPerComp.reduce((s, o) => s + Math.max(1, o / 2), 0);
  let kind;
  if (g.edges.length === 0) kind = 'empty';
  else if (comps.length > 1 || odd.length > 2) kind = 'impossible';
  else kind = odd.length === 0 ? 'circuit' : 'path';
  return {
    kind,
    vertexCount: comps.reduce((s, c) => s + c.length, 0),
    edgeCount: g.edges.length,
    degrees: deg,
    odd,
    componentCount: comps.length,
    oddPerComp,
    minStrokes,
    minAdditions: Math.max(0, minStrokes - 1),
  };
}

/**
 * Hierholzer 法でオイラー路を求める。書けないときは null。
 * 返り値: [{ edge: 辺id, from: 点id, to: 点id }] の書き順。奇数点が2つなら片方から始まる。
 */
export function eulerTrail(g, opts = {}) {
  const a = analyze(g);
  if (a.kind === 'empty') return [];
  if (a.kind === 'impossible') return null;
  let start;
  if (a.odd.length === 2) {
    start = opts.start != null && a.odd.includes(opts.start) ? opts.start : a.odd[0];
  } else {
    start = opts.start != null && a.degrees[opts.start] > 0 ? opts.start : a.degrees.findIndex((d) => d > 0);
  }
  const adj = g.vertices.map(() => []);
  for (const e of g.edges) {
    adj[e.u].push({ edge: e.id, to: e.v });
    adj[e.v].push({ edge: e.id, to: e.u });
  }
  const edgeIndex = new Map(g.edges.map((e, i) => [e.id, i]));
  const used = new Uint8Array(g.edges.length);
  const ptr = new Array(g.vertices.length).fill(0);
  const stack = [{ v: start, step: null }];
  const out = [];
  while (stack.length) {
    const top = stack[stack.length - 1];
    const list = adj[top.v];
    while (ptr[top.v] < list.length && used[edgeIndex.get(list[ptr[top.v]].edge)]) ptr[top.v]++;
    if (ptr[top.v] < list.length) {
      const nx = list[ptr[top.v]];
      used[edgeIndex.get(nx.edge)] = 1;
      stack.push({ v: nx.to, step: { edge: nx.edge, from: top.v, to: nx.to } });
    } else {
      stack.pop();
      if (top.step) out.push(top.step);
    }
  }
  return out.reverse();
}

/** 書き順が正しいか(全辺をちょうど1回、途切れずに) */
export function isValidTrail(g, trail) {
  if (trail.length !== g.edges.length) return false;
  const byId = new Map(g.edges.map((e) => [e.id, e]));
  const seen = new Set();
  for (let i = 0; i < trail.length; i++) {
    const s = trail[i];
    const e = byId.get(s.edge);
    if (!e || seen.has(s.edge)) return false;
    seen.add(s.edge);
    if (!((e.u === s.from && e.v === s.to) || (e.v === s.from && e.u === s.to))) return false;
    if (i > 0 && trail[i - 1].to !== s.from) return false;
  }
  return true;
}

/**
 * 一筆で書けるようにするために足す線(点の組)を、最少本数で提案する。
 * まず「全部の点を偶数にしてひとつにつなぐ」最少の線を作り、
 * そこから一番長い線を1本抜く(奇数点が2つ残るだけなので、一筆書きはできる)。
 */
export function suggestAdditions(g) {
  const a = analyze(g);
  if (a.kind !== 'impossible') return [];
  const pos = (v) => g.vertices[v];
  const d = (u, v) => dist(pos(u), pos(v));
  const oddSet = new Set(a.odd);
  const comps = components(g).map((c) => {
    const odd = c.filter((v) => oddSet.has(v));
    return { all: c, odd };
  });

  const adds = [];
  // 成分の中で、奇数の点を近いものどうし組にする(端の2つは成分をつなぐのに残す)
  const ends = comps.map((c) => {
    const pool = c.odd.slice();
    if (comps.length === 1) {
      pairGreedy(pool, d, adds);
      return null;
    }
    if (pool.length === 0) return { a: c.all[0], b: c.all[0] };
    // 端に使う2点: いちばん離れた組
    let best = [pool[0], pool[1]];
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        if (d(pool[i], pool[j]) > d(best[0], best[1])) best = [pool[i], pool[j]];
      }
    }
    const rest = pool.filter((v) => v !== best[0] && v !== best[1]);
    pairGreedy(rest, d, adds);
    return { a: best[0], b: best[1] };
  });

  if (comps.length > 1) {
    // 成分を輪につなぐ。順番は近いものから貪欲に。
    const order = [0];
    const left = new Set(ends.map((_, i) => i).slice(1));
    while (left.size) {
      const last = ends[order[order.length - 1]];
      let pick = null;
      for (const i of left) {
        const dd = Math.min(d(last.b, ends[i].a), d(last.b, ends[i].b));
        if (!pick || dd < pick.dd) pick = { i, dd };
      }
      const e = ends[pick.i];
      if (d(last.b, e.b) < d(last.b, e.a)) ends[pick.i] = { a: e.b, b: e.a };
      order.push(pick.i);
      left.delete(pick.i);
    }
    for (let k = 0; k < order.length; k++) {
      const from = ends[order[k]];
      const to = ends[order[(k + 1) % order.length]];
      adds.push({ u: from.b, v: to.a });
    }
  }

  // 1本抜く: いちばん長いもの
  let longest = 0;
  adds.forEach((p, i) => {
    if (d(p.u, p.v) > d(adds[longest].u, adds[longest].v)) longest = i;
  });
  adds.splice(longest, 1);
  return adds;
}

function pairGreedy(pool, d, out) {
  const rest = pool.slice();
  while (rest.length >= 2) {
    let best = null;
    for (let i = 0; i < rest.length; i++) {
      for (let j = i + 1; j < rest.length; j++) {
        const dd = d(rest[i], rest[j]);
        if (!best || dd < best.dd) best = { i, j, dd };
      }
    }
    out.push({ u: rest[best.i], v: rest[best.j] });
    rest.splice(best.j, 1);
    rest.splice(best.i, 1);
  }
}

/** 足す線を加えたグラフ。足した辺は added: true、path は既存の線からなるべく離れた弧。 */
export function withAdditions(g, adds) {
  const edges = g.edges.slice();
  let nextId = edges.reduce((m, e) => Math.max(m, e.id), -1) + 1;
  for (const p of adds) {
    edges.push({ id: nextId++, u: p.u, v: p.v, added: true, path: clearArc(g.vertices[p.u], g.vertices[p.v], edges) });
  }
  return { ...g, edges };
}

/** ふくらみ方の候補から、既存の線(path を持つもの)にいちばん近づかない弧を選ぶ */
export function clearArc(a, b, edges) {
  const others = edges.filter((e) => e.path);
  const cands = [0.18, -0.18, 0.32, -0.32, 0.05].map((bow) => arcPath(a, b, bow));
  if (!others.length) return cands[0];
  const near = Math.max(30, dist(a, b) * 0.12);
  let best = null;
  for (const pts of cands) {
    let worst = Infinity;
    // 両端のそばは必ず既存の線に近いので見ない
    for (const q of pts) {
      if (dist(q, a) < near || dist(q, b) < near) continue;
      for (const e of others) for (const r of e.path) worst = Math.min(worst, dist(q, r));
    }
    if (!best || worst > best.worst + 1e-9) best = { pts, worst };
  }
  return best.pts;
}

/** 2点を結ぶ、少しふくらんだ弧(既存の直線と重ならないように) */
export function arcPath(a, b, bow = 0.18, n = 24) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const cx = mx - dy * bow;
  const cy = my + dx * bow;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = 1 - t;
    pts.push({ x: s * s * a.x + 2 * s * t * cx + t * t * b.x, y: s * s * a.y + 2 * s * t * cy + t * t * b.y });
  }
  return pts;
}
