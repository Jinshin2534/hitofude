import { describe, expect, it } from 'vitest';
import {
  analyze,
  arcPath,
  clearArc,
  components,
  degrees,
  eulerTrail,
  isValidTrail,
  suggestAdditions,
  withAdditions,
} from '../src/lib/euler.js';

/** 点を円周に並べ、辺の組からグラフを作る */
function G(n, pairs) {
  const vertices = Array.from({ length: n }, (_, id) => ({
    id,
    x: 500 + 300 * Math.cos((id / n) * 2 * Math.PI),
    y: 375 + 300 * Math.sin((id / n) * 2 * Math.PI),
  }));
  return { vertices, edges: pairs.map(([u, v], id) => ({ id, u, v })) };
}

function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** 小さなランダム多重グラフ(輪あり)。どの点にも辺がある。 */
function randomGraph(rand) {
  const n = 2 + Math.floor(rand() * 4);
  const m = 1 + Math.floor(rand() * 6);
  const pairs = [];
  for (let k = 0; k < m; k++) {
    const u = Math.floor(rand() * n);
    const v = rand() < 0.1 ? u : Math.floor(rand() * n);
    pairs.push([u, v]);
  }
  const g = G(n, pairs);
  const deg = degrees(g);
  // 辺のない点を落として番号を詰める
  const keep = g.vertices.filter((v) => deg[v.id] > 0);
  const map = new Map(keep.map((v, i) => [v.id, i]));
  return {
    vertices: keep.map((v, i) => ({ ...v, id: i })),
    edges: g.edges.map((e) => ({ ...e, u: map.get(e.u), v: map.get(e.v) })),
  };
}

/** 一筆で書けるか(定義どおり): 連結かつ奇数点 0 か 2 */
const traversable = (g) => {
  const a = analyze(g);
  return a.kind === 'circuit' || a.kind === 'path';
};

/** k 本足して一筆書きにできるか、全通り試す */
function canFixWith(g, k) {
  const n = g.vertices.length;
  const pairs = [];
  for (let u = 0; u < n; u++) for (let v = u + 1; v < n; v++) pairs.push({ u, v });
  const rec = (start, chosen) => {
    if (chosen.length === k) return traversable(withAdditions(g, chosen));
    for (let i = start; i < pairs.length; i++) {
      chosen.push(pairs[i]);
      if (rec(i, chosen)) return true;
      chosen.pop();
    }
    return false;
  };
  return rec(0, []);
}

describe('analyze', () => {
  it('空', () => {
    expect(analyze({ vertices: [], edges: [] }).kind).toBe('empty');
  });

  it('三角形は一周できる', () => {
    const a = analyze(G(3, [[0, 1], [1, 2], [2, 0]]));
    expect(a.kind).toBe('circuit');
    expect(a.minStrokes).toBe(1);
    expect(a.minAdditions).toBe(0);
  });

  it('1本線は奇数点2つで書ける', () => {
    const a = analyze(G(2, [[0, 1]]));
    expect(a.kind).toBe('path');
    expect(a.odd).toEqual([0, 1]);
  });

  it('輪は次数を2増やす', () => {
    expect(degrees(G(1, [[0, 0]]))).toEqual([2]);
    expect(analyze(G(2, [[0, 0], [0, 1]])).kind).toBe('path');
  });

  it('ケーニヒスベルク: 奇数点4つ → 2筆、足すのは1本', () => {
    // 0=島 1=北岸 2=南岸 3=東の島
    const g = G(4, [[0, 1], [0, 1], [0, 2], [0, 2], [0, 3], [1, 3], [2, 3]]);
    const a = analyze(g);
    expect(a.kind).toBe('impossible');
    expect(degrees(g)).toEqual([5, 3, 3, 3]);
    expect(a.minStrokes).toBe(2);
    expect(a.minAdditions).toBe(1);
  });

  it('離れた図形は、奇数点0でも書けない', () => {
    const g = G(6, [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3]]);
    const a = analyze(g);
    expect(a.kind).toBe('impossible');
    expect(a.odd).toHaveLength(0);
    expect(a.componentCount).toBe(2);
    expect(a.minAdditions).toBe(1);
  });

  it('星形(K4): 奇数点4つ', () => {
    const g = G(4, [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]);
    expect(analyze(g).odd).toHaveLength(4);
    expect(analyze(g).minAdditions).toBe(1);
  });
});

describe('eulerTrail', () => {
  it('書けないときは null', () => {
    expect(eulerTrail(G(4, [[0, 1], [0, 2], [0, 3]]))).toBeNull();
  });

  it('奇数点2つなら、その片方から始まり、もう片方で終わる', () => {
    const g = G(5, [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 2], [0, 3]]);
    const a = analyze(g);
    expect(a.kind).toBe('path');
    const t = eulerTrail(g);
    expect(isValidTrail(g, t)).toBe(true);
    expect(new Set([t[0].from, t[t.length - 1].to])).toEqual(new Set(a.odd));
  });

  it('始点を指定できる(奇数点の別のほう)', () => {
    const g = G(2, [[0, 1], [0, 1], [0, 1]]);
    expect(eulerTrail(g, { start: 1 })[0].from).toBe(1);
  });

  it('一周できるときは始点に戻る', () => {
    const g = G(4, [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [0, 2]]);
    const t = eulerTrail(g);
    expect(isValidTrail(g, t)).toBe(true);
    expect(t[t.length - 1].to).toBe(t[0].from);
  });

  it('isValidTrail は途切れ・重複・抜けを弾く', () => {
    const g = G(3, [[0, 1], [1, 2], [2, 0]]);
    expect(isValidTrail(g, [{ edge: 0, from: 0, to: 1 }, { edge: 2, from: 2, to: 0 }, { edge: 1, from: 1, to: 2 }])).toBe(false);
    expect(isValidTrail(g, [{ edge: 0, from: 0, to: 1 }, { edge: 0, from: 1, to: 0 }, { edge: 1, from: 0, to: 2 }])).toBe(false);
    expect(isValidTrail(g, [{ edge: 0, from: 0, to: 1 }, { edge: 1, from: 1, to: 2 }])).toBe(false);
    expect(isValidTrail(g, [{ edge: 0, from: 0, to: 1 }, { edge: 1, from: 1, to: 2 }, { edge: 2, from: 2, to: 0 }])).toBe(true);
  });

  it('ランダムな多重グラフ 500 個: 書けると判定したら必ず正しい書き順が出る', () => {
    const rand = rng(42);
    let checked = 0;
    for (let k = 0; k < 500; k++) {
      const g = randomGraph(rand);
      const t = eulerTrail(g);
      if (traversable(g)) {
        expect(isValidTrail(g, t)).toBe(true);
        checked++;
      } else {
        expect(t).toBeNull();
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe('suggestAdditions(最少の足す線)', () => {
  it('書けるなら何も足さない', () => {
    expect(suggestAdditions(G(3, [[0, 1], [1, 2], [2, 0]]))).toEqual([]);
  });

  it('足すと本当に一筆で書ける', () => {
    const g = G(4, [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]);
    const adds = suggestAdditions(g);
    expect(adds).toHaveLength(1);
    const g2 = withAdditions(g, adds);
    expect(traversable(g2)).toBe(true);
    expect(isValidTrail(g2, eulerTrail(g2))).toBe(true);
  });

  it('離れた3つの輪は2本でつなぐ', () => {
    const g = G(3, [[0, 0], [1, 1], [2, 2]]);
    const adds = suggestAdditions(g);
    expect(adds).toHaveLength(2);
    expect(traversable(withAdditions(g, adds))).toBe(true);
  });

  it('ランダムな多重グラフ 300 個: 本数が全探索の最少と一致し、提案どおり足せば書ける', () => {
    const rand = rng(7);
    let impossible = 0;
    for (let k = 0; k < 300; k++) {
      const g = randomGraph(rand);
      const a = analyze(g);
      const adds = suggestAdditions(g);
      expect(adds).toHaveLength(a.minAdditions);
      expect(traversable(withAdditions(g, adds))).toBe(true);
      if (a.minAdditions > 0) {
        impossible++;
        // それより1本少ないと、どう足しても書けない
        expect(canFixWith(g, a.minAdditions - 1)).toBe(false);
      }
    }
    expect(impossible).toBeGreaterThan(30);
  });

  it('「最少の足す線」=「このままの最少筆数 − 1」', () => {
    const rand = rng(99);
    for (let k = 0; k < 200; k++) {
      const a = analyze(randomGraph(rand));
      expect(a.minAdditions).toBe(a.minStrokes - 1);
    }
  });
});

describe('補助', () => {
  it('components は辺でつながった点の組', () => {
    expect(components(G(5, [[0, 1], [2, 3], [3, 4]])).map((c) => c.length).sort()).toEqual([2, 3]);
  });

  it('arcPath は両端を通る', () => {
    const p = arcPath({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(p[0]).toEqual({ x: 0, y: 0 });
    expect(p[p.length - 1].x).toBeCloseTo(100);
    expect(Math.abs(p[12].y)).toBeGreaterThan(5);
  });

  it('withAdditions は元のグラフを変えない', () => {
    const g = G(4, [[0, 1], [2, 3]]);
    const g2 = withAdditions(g, [{ u: 1, v: 2 }]);
    expect(g.edges).toHaveLength(2);
    expect(g2.edges).toHaveLength(3);
    expect(g2.edges[2].added).toBe(true);
  });
});

describe('clearArc', () => {
  it('既存の弧とは反対側にふくらませる', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 200, y: 0 };
    const existing = [{ path: arcPath(a, b, 0.18) }];
    const pts = clearArc(a, b, existing);
    const mid = pts[Math.floor(pts.length / 2)];
    const exMid = existing[0].path[12];
    expect(Math.sign(mid.y)).toBe(-Math.sign(exMid.y));
  });
});
