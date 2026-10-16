import './style.css';
import { buildGraph, findNearMisses } from './lib/graph.js';
import { analyze, eulerTrail, suggestAdditions, withAdditions } from './lib/euler.js';
import { PRESETS, WORLD, presetByKey } from './lib/presets.js';
import { render, setupCanvas, trailPaths } from './draw.js';

const $ = (sel) => document.querySelector(sel);

document.querySelector('#app').innerHTML = `
  <header class="top">
    <h1>一筆書き判定 <span class="slug">hitofude</span></h1>
    <p class="lead">図形を描くと、一筆で書けるかを判定して書き順を見せます。</p>
  </header>
  <main class="layout">
    <section class="board">
      <div class="tools">
        <button id="undo" type="button">元に戻す</button>
        <button id="clear" type="button">全部消す</button>
        <label class="preset">お手本
          <select id="preset">
            <option value="">— えらぶ —</option>
            ${PRESETS.map((p) => `<option value="${p.key}">${p.name}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="canvas-wrap">
        <canvas id="cv" aria-label="図形を描くところ"></canvas>
        <p id="hint" class="hint">ここに指かマウスで図形を描いてください。線は何本に分けて描いてもかまいません。</p>
      </div>
      <p id="presetNote" class="preset-note" hidden></p>
    </section>
    <aside class="panel">
      <div id="verdict" class="verdict empty">
        <p class="v-title">まだ何も描かれていません</p>
        <p class="v-sub"></p>
      </div>
      <dl class="counts">
        <div><dt>点</dt><dd id="nV">0</dd></div>
        <div><dt>線</dt><dd id="nE">0</dd></div>
        <div class="odd"><dt>奇数の点</dt><dd id="nOdd">0</dd></div>
        <div><dt>かたまり</dt><dd id="nC">0</dd></div>
      </dl>
      <div id="fix" class="fix" hidden></div>
      <div class="play">
        <button id="play" type="button" class="primary" disabled>書き順を見る</button>
        <span id="step" class="step"></span>
      </div>
      <div id="notes" class="notes"></div>
      <details class="rule" open>
        <summary>判定のルール</summary>
        <p>点ごとに、そこに集まる線の本数を数えます(赤い数字)。本数が奇数の点を<b>奇数の点</b>と呼びます。</p>
        <ul>
          <li>奇数の点が <b>0個</b> → 一筆で書ける。書き始めた点に戻ってくる。</li>
          <li>奇数の点が <b>2個</b> → 一筆で書ける。片方から書き始め、もう片方で終わる。</li>
          <li>それ以外、または図形が離れている → 一筆では書けない。</li>
        </ul>
        <p>途中で通り過ぎる点には「入る線」と「出る線」が対で要るので、始点と終点以外は偶数でなければならない、というのが理由です(オイラー, 1736)。</p>
        <p class="small">点になるのは、線の端・線どうしの交点・線の端が別の線に触れた所です。角は点にしません(線が2本の点は判定に影響しないため)。</p>
      </details>
    </aside>
  </main>
  <footer class="foot">
    判定は画面に表示した「点と線」に対して行います。なぞって重ねた線は、重なった部分を別の線として数えられません。
  </footer>
`;

const canvas = $('#cv');
const { ctx, resize } = setupCanvas(canvas);
let cssWidth = resize();

const state = {
  strokes: [],
  current: null,
  graph: buildGraph([]),
  analysis: analyze(buildGraph([])),
  nearMisses: [],
  suggestion: null,
  adds: [],
  play: null,
  preset: null,
};

/** 指でも当てやすいよう、画面上 14px 以上はつなぐ */
const snapRadius = () => Math.max(18, (14 * WORLD.w) / cssWidth);

function recompute() {
  const g = buildGraph(state.strokes, { snap: snapRadius() });
  state.graph = g;
  state.analysis = analyze(g);
  state.nearMisses = findNearMisses(g);
  state.adds = suggestAdditions(g);
  state.suggestion = state.adds.length ? withAdditions(g, state.adds) : null;
  stopPlay();
  updatePanel();
  draw();
}

function draw() {
  render(ctx, canvas, state);
}

function updatePanel() {
  const a = state.analysis;
  const g = state.graph;
  $('#nV').textContent = a.vertexCount;
  $('#nE').textContent = a.edgeCount;
  $('#nOdd').textContent = a.odd.length;
  $('#nC').textContent = a.componentCount;
  $('#hint').hidden = state.strokes.length > 0;

  const v = $('#verdict');
  v.className = `verdict ${a.kind}`;
  const title = v.querySelector('.v-title');
  const sub = v.querySelector('.v-sub');
  if (a.kind === 'empty') {
    title.textContent = 'まだ何も描かれていません';
    sub.textContent = '';
  } else if (a.kind === 'circuit') {
    title.textContent = '一筆で書けます';
    sub.textContent = '奇数の点は0個。どこから書き始めても、その点に戻ってきます。';
  } else if (a.kind === 'path') {
    title.textContent = '一筆で書けます';
    sub.textContent = '奇数の点は2個。赤い点の片方から書き始め、もう片方で終わります。';
  } else {
    title.textContent = '一筆では書けません';
    const why = [];
    if (a.odd.length > 2) why.push(`奇数の点が${a.odd.length}個あります(0個か2個でないと書けない)`);
    if (a.componentCount > 1) why.push(`図形が${a.componentCount}つに離れています`);
    sub.textContent = why.join('。') + '。';
  }

  const fix = $('#fix');
  if (a.kind === 'impossible') {
    fix.hidden = false;
    fix.innerHTML = `
      <p class="fix-title">線をあと <b>${a.minAdditions}</b> 本足せば書けます</p>
      <p class="small">赤い点線が足す線の一例です(ほかの線と交わっても、そこは点にしません)。このままなら最少 <b>${a.minStrokes}</b> 筆で書けます。</p>
      <button id="playFix" type="button">足した線で書き順を見る</button>`;
    $('#playFix').addEventListener('click', () => startPlay(state.suggestion));
  } else {
    fix.hidden = true;
    fix.innerHTML = '';
  }

  $('#play').disabled = !(a.kind === 'circuit' || a.kind === 'path');

  const notes = [];
  if (state.nearMisses.length) {
    notes.push(
      `<p class="warn">黄色の点線の端は、ほかの線に${state.nearMisses.length > 1 ? 'どれも' : ''}あと少しで届いていません。つながっていないものとして判定しています。つなぎたいときは線を重ねて描いてください。</p>`,
    );
  }
  if (g.ignored) notes.push(`<p class="small">短すぎる線・点 ${g.ignored} 個は線として数えていません。</p>`);
  $('#notes').innerHTML = notes.join('');
  $('#step').textContent = '';
}

// --- 書き順の再生 ---
const SPEED = 520; // 1秒あたりの長さ(画面座標)
let raf = 0;
let timer = 0;

function startPlay(graph = state.graph) {
  const trail = eulerTrail(graph);
  if (!trail || !trail.length) return;
  const paths = trailPaths(graph, trail);
  const total = paths.reduce((s, p) => s + p.length, 0);
  const duration = Math.max(1.5, total / SPEED + paths.length * 0.08) * 1000;
  stopPlay();
  state.play = { graph, trail, paths, progress: 0, duration, t0: performance.now() };
  $('#play').textContent = '止める';
  const tick = () => {
    if (!state.play) return;
    seek((performance.now() - state.play.t0) / state.play.duration);
    if (state.play.progress < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  // rAF が止まる環境(裏タブなど)でも最後の絵は出す
  timer = setTimeout(() => state.play && seek(1), duration + 200);
}

function seek(p) {
  if (!state.play) return;
  const play = state.play;
  play.progress = Math.max(0, Math.min(1, p));
  const total = play.paths.reduce((s, x) => s + x.length, 0);
  let acc = 0;
  let done = 0;
  for (const x of play.paths) {
    if (acc + x.length <= play.progress * total + 1e-6) done++;
    acc += x.length;
  }
  $('#step').textContent = `${Math.min(done + (play.progress < 1 ? 1 : 0), play.paths.length)} / ${play.paths.length} 本目`;
  if (play.progress >= 1) $('#play').textContent = 'もう一度';
  draw();
}

function stopPlay() {
  cancelAnimationFrame(raf);
  clearTimeout(timer);
  const was = !!state.play;
  state.play = null;
  $('#play').textContent = '書き順を見る';
  $('#step').textContent = '';
  if (was) draw();
}

$('#play').addEventListener('click', () => {
  if (state.play && state.play.progress < 1) stopPlay();
  else startPlay(state.graph);
});

// --- 入力 ---
function toWorld(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * WORLD.w, y: ((ev.clientY - r.top) / r.height) * WORLD.h };
}

canvas.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  canvas.setPointerCapture(ev.pointerId);
  stopPlay();
  state.current = [toWorld(ev)];
  $('#hint').hidden = true;
});
canvas.addEventListener('pointermove', (ev) => {
  if (!state.current) return;
  const events = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
  for (const e of events.length ? events : [ev]) {
    const p = toWorld(e);
    const last = state.current[state.current.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) >= 2) state.current.push(p);
  }
  draw();
});
const finish = () => {
  if (!state.current) return;
  addStroke(state.current);
  state.current = null;
};
canvas.addEventListener('pointerup', finish);
canvas.addEventListener('pointercancel', finish);

function addStroke(pts) {
  state.strokes.push(pts.map((p) => ({ x: p.x, y: p.y })));
  setPreset(null);
  recompute();
}

function setPreset(key) {
  state.preset = key;
  const note = $('#presetNote');
  const p = key && presetByKey(key);
  note.hidden = !p;
  note.textContent = p ? `${p.name}: ${p.note}` : '';
  if (!key) $('#preset').value = '';
}

function loadPreset(key) {
  const p = presetByKey(key);
  if (!p) return;
  state.strokes = p.strokes();
  recompute();
  setPreset(key);
  $('#preset').value = key;
}

$('#preset').addEventListener('change', (e) => (e.target.value ? loadPreset(e.target.value) : null));
$('#undo').addEventListener('click', () => {
  state.strokes.pop();
  setPreset(null);
  recompute();
});
$('#clear').addEventListener('click', () => {
  state.strokes = [];
  setPreset(null);
  recompute();
});

window.addEventListener('resize', () => {
  cssWidth = resize();
  recompute();
});

recompute();

// ヘッドレス検証用
window.__app = {
  get state() {
    return state;
  },
  summary() {
    const a = state.analysis;
    return {
      kind: a.kind,
      vertices: a.vertexCount,
      edges: a.edgeCount,
      odd: a.odd.length,
      components: a.componentCount,
      minAdditions: a.minAdditions,
      minStrokes: a.minStrokes,
      nearMisses: state.nearMisses.length,
      playing: !!state.play,
      progress: state.play?.progress ?? null,
    };
  },
  loadPreset,
  addStroke,
  clear: () => $('#clear').click(),
  undo: () => $('#undo').click(),
  play: (withFix = false) => startPlay(withFix ? state.suggestion : state.graph),
  /** 書き順の途中(0..1)で止めて描く */
  seek(p) {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    seek(p);
  },
  stop: stopPlay,
  presets: PRESETS.map((p) => p.key),
};
