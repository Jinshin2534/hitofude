// お手本の図形。手描きと同じく「ストロークの並び」として作り、同じ buildGraph を通す。
// 座標は 1000×750 の画面座標。

export const WORLD = { w: 1000, h: 750 };

const P = (x, y) => ({ x, y });
const line = (a, b) => [a, b];
const poly = (...pts) => pts;

function circle(cx, cy, r, n = 64, start = 0) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = start + (i / n) * Math.PI * 2;
    pts.push(P(cx + r * Math.cos(t), cy + r * Math.sin(t)));
  }
  return pts;
}

function curve(a, c, b, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = 1 - t;
    pts.push(P(s * s * a.x + 2 * s * t * c.x + t * t * b.x, s * s * a.y + 2 * s * t * c.y + t * t * b.y));
  }
  return pts;
}

export const PRESETS = [
  {
    key: 'house',
    name: '家(ニコラウスの家)',
    note: '下の2つの角が奇数。片方から書き始める。',
    strokes() {
      const tl = P(350, 330);
      const tr = P(650, 330);
      const bl = P(350, 630);
      const br = P(650, 630);
      const top = P(500, 150);
      return [poly(tl, tr, br, bl, tl), line(tl, br), line(tr, bl), poly(tl, top, tr)];
    },
  },
  {
    key: 'star',
    name: '星',
    note: '交点はぜんぶ線が4本。どこから書いても戻ってこられる。',
    strokes() {
      const pts = [];
      for (let i = 0; i <= 5; i++) {
        const t = -Math.PI / 2 + ((i * 2) % 5) * ((Math.PI * 2) / 5);
        pts.push(P(500 + 290 * Math.cos(t), 390 + 290 * Math.sin(t)));
      }
      return [pts];
    },
  },
  {
    key: 'ta',
    name: '田',
    note: '辺のまんなかの4点が奇数(線が3本)。',
    strokes() {
      const L = 300;
      const R = 700;
      const T = 175;
      const B = 575;
      return [poly(P(L, T), P(R, T), P(R, B), P(L, B), P(L, T)), line(P(500, T), P(500, B)), line(P(L, 375), P(R, 375))];
    },
  },
  {
    key: 'konigsberg',
    name: 'ケーニヒスベルクの橋',
    note: 'オイラーが「渡りきれない」と示した7本の橋。4つの陸地がすべて奇数。',
    strokes() {
      const N = P(470, 110); // 北岸
      const S = P(470, 640); // 南岸
      const A = P(380, 375); // 中の島
      const D = P(760, 375); // 東の島
      return [
        curve(A, P(330, 220), N),
        curve(A, P(500, 220), N),
        curve(A, P(330, 530), S),
        curve(A, P(500, 530), S),
        line(A, D),
        curve(N, P(680, 200), D),
        curve(S, P(680, 550), D),
      ];
    },
  },
  {
    key: 'rings',
    name: '五輪',
    note: '輪が交わる所はどれも線が4本。',
    strokes() {
      // 本物と同じく、上の輪どうし・下の輪どうしは交わらない
      const r = 110;
      const up = -Math.PI / 2;
      const down = Math.PI / 2;
      return [
        circle(260, 300, r, 64, up),
        circle(500, 300, r, 64, up),
        circle(740, 300, r, 64, up),
        circle(380, 410, r, 64, down),
        circle(620, 410, r, 64, down),
      ];
    },
  },
  {
    key: 'apart',
    name: '離れた2つの四角',
    note: '奇数の点は0個でも、離れていると一筆では書けない。',
    strokes() {
      return [
        poly(P(170, 250), P(420, 250), P(420, 500), P(170, 500), P(170, 250)),
        poly(P(580, 250), P(830, 250), P(830, 500), P(580, 500), P(580, 250)),
      ];
    },
  },
];

export const presetByKey = (key) => PRESETS.find((p) => p.key === key);
