import { describe, expect, it } from 'vitest';
import { buildGraph, findNearMisses } from '../src/lib/graph.js';
import { analyze, degrees } from '../src/lib/euler.js';
import { PRESETS, presetByKey } from '../src/lib/presets.js';

const P = (x, y) => ({ x, y });
/** 手描きらしく、細かい点の列にして少し揺らす */
function wobbly(pts, step = 4, amp = 1.2, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * amp;
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k < n; k++) out.push(P(a.x + ((b.x - a.x) * k) / n + rnd(), a.y + ((b.y - a.y) * k) / n + rnd()));
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const sortedDegrees = (g) => degrees(g).slice().sort((a, b) => a - b);

describe('buildGraph', () => {
  it('1本の線は 点2つ・辺1本', () => {
    const g = buildGraph([wobbly([P(100, 100), P(400, 120)])]);
    expect(g.vertices).toHaveLength(2);
    expect(g.edges).toHaveLength(1);
  });

  it('点を打っただけ・ごく短い線は無視して数える', () => {
    const g = buildGraph([[P(10, 10)], [P(50, 50), P(55, 52)], [P(100, 100), P(300, 100)]]);
    expect(g.edges).toHaveLength(1);
    expect(g.ignored).toBe(2);
  });

  it('×字は 交点(線4本)+端4つ', () => {
    const g = buildGraph([wobbly([P(100, 100), P(400, 400)]), wobbly([P(400, 100), P(100, 400)], 4, 1.2, 7)]);
    expect(sortedDegrees(g)).toEqual([1, 1, 1, 1, 4]);
    expect(g.edges).toHaveLength(4);
  });

  it('T字(端が別の線の途中に触れる)は線3本の点になる', () => {
    const g = buildGraph([wobbly([P(100, 200), P(500, 200)]), wobbly([P(300, 400), P(300, 208)])]);
    expect(sortedDegrees(g)).toEqual([1, 1, 1, 3]);
  });

  it('端が少し届いていなくても snap 以内ならつなぐ / それより遠いとつながない', () => {
    const near = buildGraph([[P(100, 200), P(500, 200)], [P(300, 400), P(300, 210)]], { snap: 18 });
    expect(sortedDegrees(near)).toEqual([1, 1, 1, 3]);
    const far = buildGraph([[P(100, 200), P(500, 200)], [P(300, 400), P(300, 230)]], { snap: 18 });
    expect(sortedDegrees(far)).toEqual([1, 1, 1, 1]);
  });

  it('届いていない端は「つながっていないかも」として拾う', () => {
    const g = buildGraph([[P(100, 200), P(500, 200)], [P(300, 400), P(300, 230)]], { snap: 18 });
    const miss = findNearMisses(g);
    expect(miss).toHaveLength(1);
    expect(miss[0].d).toBeCloseTo(30, 0);
    const ok = buildGraph([[P(100, 200), P(500, 200)], [P(300, 400), P(300, 300)]], { snap: 18 });
    expect(findNearMisses(ok)).toHaveLength(0);
  });

  it('ひと筆の丸は 点1つに輪が1本(線2本の点)', () => {
    const pts = [];
    for (let i = 0; i <= 60; i++) pts.push(P(300 + 100 * Math.cos((i / 60) * 2 * Math.PI), 300 + 100 * Math.sin((i / 60) * 2 * Math.PI)));
    pts[pts.length - 1] = P(395, 306); // 閉じ目が少しずれる
    const g = buildGraph([pts]);
    expect(g.vertices).toHaveLength(1);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].u).toBe(g.edges[0].v);
    expect(degrees(g)).toEqual([2]);
  });

  it('角をばらばらに描いた四角は 角が線2本ずつ', () => {
    const c = [P(100, 100), P(400, 100), P(400, 400), P(100, 400)];
    const strokes = c.map((p, i) => wobbly([p, c[(i + 1) % 4]], 4, 1.5, i + 3));
    strokes[1][0] = P(408, 96); // 角が少しはみ出る
    const g = buildGraph(strokes);
    expect(sortedDegrees(g)).toEqual([2, 2, 2, 2]);
    expect(analyze(g).kind).toBe('circuit');
  });

  it('八の字(自分と交わる1本の線)は交点が線4本', () => {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const t = (i / 80) * 2 * Math.PI;
      pts.push(P(300 + 150 * Math.sin(t), 300 + 100 * Math.sin(2 * t)));
    }
    const g = buildGraph([pts]);
    // 始点=終点=交点 なので、点1つに輪が2本
    expect(degrees(g)).toEqual([4]);
    expect(analyze(g).kind).toBe('circuit');
  });

  it('6の字(端が自分の途中に触れる)は線3本の点ができる', () => {
    const pts = [P(300, 100), P(250, 250)];
    for (let i = 0; i <= 40; i++) {
      const t = Math.PI + (i / 40) * 2 * Math.PI * 0.97;
      pts.push(P(330 + 80 * Math.cos(t), 300 + 80 * Math.sin(t)));
    }
    const g = buildGraph([pts]);
    const deg = sortedDegrees(g);
    expect(deg).toContain(3);
    expect(deg).toContain(1);
  });

  it('同じ順の入力なら同じ結果(決定的)', () => {
    const s = presetByKey('house').strokes();
    expect(buildGraph(s)).toEqual(buildGraph(s));
  });
});

describe('お手本の図形', () => {
  // 角はそれだけでは点にならない(線の端・交点・T字だけが点)。線2本の点は判定に効かないので問題ない。
  const expectations = {
    house: { kind: 'path', odd: 2, deg: [3, 3, 4, 4, 4], add: 0 },
    star: { kind: 'circuit', odd: 0, deg: [2, 4, 4, 4, 4, 4], add: 0 },
    ta: { kind: 'impossible', odd: 4, deg: [2, 3, 3, 3, 3, 4], add: 1 },
    konigsberg: { kind: 'impossible', odd: 4, deg: [3, 3, 3, 5], add: 1 },
    rings: { kind: 'circuit', odd: 0, add: 0 },
    apart: { kind: 'impossible', odd: 0, deg: [2, 2], add: 1 },
  };
  for (const p of PRESETS) {
    it(`${p.name}`, () => {
      const g = buildGraph(p.strokes());
      const a = analyze(g);
      const exp = expectations[p.key];
      expect(a.kind).toBe(exp.kind);
      expect(a.odd).toHaveLength(exp.odd);
      if (exp.deg) expect(sortedDegrees(g)).toEqual(exp.deg);
      expect(a.minAdditions).toBe(exp.add);
    });
  }

  it('五輪: 交点8つ(線4本)と、輪の閉じ目5つ(線2本)', () => {
    const g = buildGraph(presetByKey('rings').strokes());
    const deg = sortedDegrees(g);
    expect(deg.filter((d) => d === 4)).toHaveLength(8);
    expect(deg.filter((d) => d === 2)).toHaveLength(5);
  });
});
