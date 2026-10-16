// Canvas への描画だけを受け持つ。状態は app.js から渡す。
import { midpoint, partialPolyline, polylineLength } from './lib/geometry.js';
import { WORLD } from './lib/presets.js';

const C = {
  paper: '#f7f2e8',
  grid: 'rgba(60, 70, 90, 0.07)',
  ink: '#22262f',
  inkFaint: 'rgba(34, 38, 47, 0.18)',
  shu: '#d4462a',
  shuSoft: 'rgba(212, 70, 42, 0.14)',
  warn: '#c98a10',
};

export function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const resize = () => {
    const w = canvas.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(((w * WORLD.h) / WORLD.w) * dpr);
    return w;
  };
  return { ctx, resize };
}

/** 画面が小さいとき、線・点・数字を太らせる倍率 */
let U = 1;

const trailColor = (i, n) => `hsl(${215 - (n <= 1 ? 0 : (i / (n - 1)) * 205)}, 62%, 42%)`;

function path(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

function badge(ctx, p, text, fill, color = '#fff', r0 = 15) {
  const r = r0 * U;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = `600 ${Math.round(r * 1.15)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, p.x, p.y + 1);
}

/**
 * @param {object} s
 *  graph, analysis, nearMisses, current(描きかけの線), suggestion(足す線を加えたグラフ|null),
 *  play: { graph, paths(trailPaths の結果), progress(0..1 の長さ比) } | null
 */
export function render(ctx, canvas, s) {
  const k = canvas.width / WORLD.w;
  U = Math.min(2.4, Math.max(1, 640 / (canvas.clientWidth || 640)));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(k, 0, 0, k, 0, 0);

  // 方眼
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1 / k;
  for (let x = 50; x < WORLD.w; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD.h);
    ctx.stroke();
  }
  for (let y = 50; y < WORLD.h; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.w, y);
    ctx.stroke();
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const g = s.graph;
  const playing = !!s.play;

  // 線
  ctx.strokeStyle = playing ? C.inkFaint : C.ink;
  ctx.lineWidth = 7 * U;
  for (const e of g.edges) {
    path(ctx, e.path);
    ctx.stroke();
  }

  // 足せば書ける線(提案)
  const sug = playing ? s.play.graph : s.suggestion;
  if (sug) {
    ctx.save();
    ctx.setLineDash([14, 12]);
    ctx.strokeStyle = playing ? 'rgba(212, 70, 42, 0.35)' : C.shu;
    ctx.lineWidth = 5 * U;
    for (const e of sug.edges) {
      if (!e.added) continue;
      path(ctx, e.path);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 書き順
  if (playing) drawPlayback(ctx, s.play);

  // 点
  const deg = s.analysis.degrees;
  for (const v of g.vertices) {
    const d = deg[v.id];
    if (d % 2 === 1 && !playing) {
      ctx.beginPath();
      ctx.arc(v.x, v.y, 26 * U, 0, Math.PI * 2);
      ctx.fillStyle = C.shuSoft;
      ctx.fill();
      badge(ctx, v, String(d), C.shu);
    } else {
      ctx.beginPath();
      ctx.arc(v.x, v.y, (playing ? 6 : 8) * U, 0, Math.PI * 2);
      ctx.fillStyle = playing ? 'rgba(34,38,47,0.45)' : C.ink;
      ctx.fill();
      if (!playing) {
        ctx.beginPath();
        ctx.arc(v.x, v.y, 3.2 * U, 0, Math.PI * 2);
        ctx.fillStyle = C.paper;
        ctx.fill();
      }
    }
  }

  // つながっていないかもしれない端
  if (!playing) {
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = C.warn;
    ctx.lineWidth = 3 * U;
    for (const m of s.nearMisses) {
      const v = g.vertices[m.vertex];
      ctx.beginPath();
      ctx.arc(v.x, v.y, 20 * U, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(v.x, v.y);
      ctx.lineTo(m.point.x, m.point.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 描きかけ
  if (s.current && s.current.length > 1) {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 7 * U;
    path(ctx, s.current);
    ctx.stroke();
  }
}

/** 書き順の各辺を、向きをそろえた折れ線にする */
export function trailPaths(graph, trail) {
  const byId = new Map(graph.edges.map((e) => [e.id, e]));
  return trail.map((st) => {
    const e = byId.get(st.edge);
    const pts = e.u === st.from ? e.path : e.path.slice().reverse();
    return { pts, added: !!e.added, length: polylineLength(pts) };
  });
}


function drawPlayback(ctx, play) {
  const { paths, progress } = play;
  const total = paths.reduce((s, p) => s + p.length, 0);
  let left = progress * total;
  const n = paths.length;
  let pen = paths[0].pts[0];
  const labels = [];
  for (let i = 0; i < n; i++) {
    const p = paths[i];
    if (left <= 0) break;
    const part = left >= p.length ? p.pts : partialPolyline(p.pts, left);
    ctx.save();
    if (p.added) ctx.setLineDash([14, 12]);
    ctx.strokeStyle = trailColor(i, n);
    ctx.lineWidth = 8 * U;
    path(ctx, part);
    ctx.stroke();
    ctx.restore();
    pen = part[part.length - 1];
    if (left >= p.length) labels.push({ at: midpoint(p.pts), i });
    left -= p.length;
  }
  for (const l of labels) badge(ctx, l.at, String(l.i + 1), '#fff', trailColor(l.i, n), 13);
  for (const l of labels) {
    ctx.beginPath();
    ctx.arc(l.at.x, l.at.y, 13 * U, 0, Math.PI * 2);
    ctx.strokeStyle = trailColor(l.i, n);
    ctx.lineWidth = 2.5 * U;
    ctx.stroke();
  }
  // 始点・終点
  const start = paths[0].pts[0];
  badge(ctx, { x: start.x - 30 * U, y: start.y - 30 * U }, '始', C.ink, '#fff', 16);
  if (progress >= 1) {
    const last = paths[n - 1].pts;
    const end = last[last.length - 1];
    const same = Math.hypot(end.x - start.x, end.y - start.y) < 1;
    badge(ctx, { x: end.x + (same ? 30 : -30) * U, y: end.y - 30 * U }, '終', C.shu, '#fff', 16);
  }
  // 筆先
  ctx.beginPath();
  ctx.arc(pen.x, pen.y, 12 * U, 0, Math.PI * 2);
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(pen.x, pen.y, 5 * U, 0, Math.PI * 2);
  ctx.fillStyle = C.paper;
  ctx.fill();
}
