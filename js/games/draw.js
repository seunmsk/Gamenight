import { sample, shuffle, esc, A, av, timer, norm } from '../ui.js';
import { DRAW_WORDS } from '../content.js';

const PENS = ['#1b1b1b', '#e63946', '#2f6fdf', '#2a9d4b', '#f2b705', '#8d5524', '#ffffff'];

function lev(a, b) {
  const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
export function paintStroke(cv, s, from = 0) {
  if (!cv || !s.pts.length) return;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.strokeStyle = s.c; g.fillStyle = s.c; g.lineWidth = s.w * W; g.lineCap = 'round'; g.lineJoin = 'round';
  const p = s.pts;
  if (p.length === 1) { g.beginPath(); g.arc(p[0][0] * W, p[0][1] * H, s.w * W / 2, 0, 7); g.fill(); return; }
  g.beginPath(); const st = Math.max(0, from - 1); g.moveTo(p[st][0] * W, p[st][1] * H);
  for (let i = st + 1; i < p.length; i++) g.lineTo(p[i][0] * W, p[i][1] * H);
  g.stroke();
}
function paintAll(cv, strokes) {
  if (!cv) return;
  const g = cv.getContext('2d'); g.fillStyle = '#fffdf7'; g.fillRect(0, 0, cv.width, cv.height);
  strokes.forEach(s => paintStroke(cv, s));
}
function sizeCanvas(cv) {
  const r = cv.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(200, Math.round(r.width * dpr)); if (cv.width !== w) { cv.width = w; cv.height = Math.round(w * 0.75); }
}

function nextTurn(ctx, gs) {
  gs.turn++;
  if (gs.turn >= gs.order.length) {
    if (ctx.solo) return ctx.finish({ me: gs.got }, { title: `You drew ${gs.got} of ${gs.order.length} correctly`, unit: 'drawings' });
    return ctx.finish(gs.score, { title: 'Picasso of the night', lines: ['Guess fast for more points. Drawers score for every correct guess.'] });
  }
  gs.drawer = gs.order[gs.turn]; gs.choices = sample(gs.pool.filter(w => !gs.used.includes(w)), 3);
  gs.phase = 'choose'; gs.strokes = []; gs.correct = []; gs.feed = []; gs.word = null; gs.end = Date.now() + 15000;
  ctx.after('d', 15300, () => choose(ctx, gs, gs.choices[0]));
  ctx.sync();
}
function choose(ctx, gs, w) {
  if (gs.phase !== 'choose' || !gs.choices.includes(w)) return;
  gs.word = w; gs.used.push(w); gs.phase = 'draw'; gs.start = Date.now(); gs.end = gs.start + gs.secs * 1000; gs.tid = Math.random().toString(36).slice(2, 8);
  ctx.after('d', gs.secs * 1000 + 300, () => reveal(ctx, gs));
  ctx.after('hint', gs.secs * 500, () => { gs.hint = true; ctx.sync(); });
  gs.hint = false; ctx.sfx('start'); ctx.sync();
}
function reveal(ctx, gs) {
  if (gs.phase !== 'draw') return;
  ctx.cancel('d'); ctx.cancel('hint'); gs.phase = 'reveal'; ctx.sfx('bad');
  ctx.after('d', 6000, () => nextTurn(ctx, gs)); ctx.sync();
}
const blanks = (w, hint) => w.split('').map((ch, i) => ch === ' ' ? '&nbsp;&nbsp;' : (hint && i === 0 ? esc(ch) : '_')).join(' ');

export default {
  id: 'draw', name: 'Wetin I Draw?', color: '#00b8d9', glyph: 'D',
  blurb: 'One person draws on their phone, it shows on the big screen. Type your guess fast.',
  players: '3–12, or one phone', min: 3, max: 12, solo: 'onephone',
  options: [
    { key: 'secs', label: 'Drawing time', choices: [[60, '60s'], [80, '80s'], [100, '100s']], def: 80 },
    { key: 'rounds', label: 'Turns each', choices: [[1, '1'], [2, '2']], def: 1 },
    { key: 'n', label: 'Drawings (one phone)', choices: [[5, '5'], [8, '8'], [12, '12']], def: 8, solo: true }
  ],
  start(ctx, o) {
    const hs = ctx.humans().map(p => p.pid);
    let order = [];
    if (ctx.solo) order = Array(+o.n || 8).fill('me');
    else for (let r = 0; r < (+o.rounds || 1); r++) order.push(...shuffle(hs));
    const gs = { order, turn: -1, pool: DRAW_WORDS, used: [], secs: +o.secs || 80, score: {}, got: 0, strokes: [] };
    hs.forEach(pid => { gs.score[pid] = 0; });
    nextTurn(ctx, gs);
    return gs;
  },
  act(ctx, gs, pid, a) {
    const isDrawer = ctx.solo || pid === gs.drawer;
    if (a.k === 'pick' && isDrawer) { choose(ctx, gs, a.w); return false; }
    if (a.k === 'st' && isDrawer && gs.phase === 'draw' && !ctx.solo && a.tid === gs.tid) {
      let s = gs.strokes.find(x => x.id === a.id);
      const pts = (Array.isArray(a.pts) ? a.pts : []).slice(0, 400).filter(p => Array.isArray(p) && p.length === 2).map(([x, y]) => [Math.max(0, Math.min(1, +x || 0)), Math.max(0, Math.min(1, +y || 0))]);
      const from = s ? s.pts.length : 0;
      if (!s) { if (gs.strokes.length > 600) return false; s = { id: a.id, c: PENS.includes(a.c) ? a.c : '#1b1b1b', w: Math.max(0.004, Math.min(0.06, +a.w || 0.01)), pts: [] }; gs.strokes.push(s); }
      s.pts.push(...pts);
      paintStroke(document.getElementById('drawtv'), s, from);
      ctx.fx({ k: 'st', id: s.id, c: s.c, w: s.w, pts, from });
      return false;
    }
    if (a.k === 'clear' && isDrawer && gs.phase === 'draw') { gs.strokes = []; paintAll(document.getElementById('drawtv'), []); ctx.fx({ k: 'clr' }); return false; }
    if (a.k === 'guess' && gs.phase === 'draw' && !isDrawer && !gs.correct.includes(pid)) {
      const g = norm(a.g).slice(0, 40), w = norm(gs.word); if (!g) return false;
      if (g === w || (w.length > 4 && lev(g, w) <= 1)) {
        const left = Math.max(0, gs.end - Date.now()) / (gs.secs * 1000);
        const pts = 100 + Math.round(200 * left);
        gs.score[pid] += pts; gs.score[gs.drawer] += 50; gs.correct.push(pid); ctx.sfx('ok');
        gs.feed.unshift({ n: ctx.name(pid), ok: 1 });
        const guessers = ctx.humans().filter(p => p.pid !== gs.drawer && ctx.online(p.pid));
        if (guessers.every(p => gs.correct.includes(p.pid))) { reveal(ctx, gs); return false; }
      } else {
        gs.feed.unshift({ n: ctx.name(pid), g: String(a.g).slice(0, 30), close: w.length > 3 && lev(g, w) === 2 });
      }
      gs.feed = gs.feed.slice(0, 7);
      return true;
    }
    if (ctx.solo && gs.phase === 'draw' && (a.k === 'yes' || a.k === 'no')) { if (a.k === 'yes') { gs.got++; ctx.sfx('ok'); } reveal(ctx, gs); return false; }
    if (a.k === 'skip' && ctx.isCtl(pid)) { if (gs.phase === 'draw') reveal(ctx, gs); else if (gs.phase === 'reveal') { ctx.cancel('d'); nextTurn(ctx, gs); } else if (gs.phase === 'choose') choose(ctx, gs, gs.choices[0]); return false; }
    return false;
  },
  tv(ctx, gs) {
    const meta = `<span class="pill">Turn ${gs.turn + 1} of ${gs.order.length}</span>`;
    const dr = ctx.p(gs.drawer);
    if (ctx.solo) {
      if (gs.phase === 'choose') return `<div class="center-stack">${meta}<h1 class="display">Pick a word to draw</h1><p class="lead">Hide the screen from the guessers! ${timer(gs.end)}</p></div>`;
      if (gs.phase === 'draw') return `<div class="center-stack">${meta}<div class="bigtimer">${timer(gs.end, 'huge')}</div><p class="lead">Drawn so far: ${gs.got}</p></div>`;
      return `<div class="center-stack">${meta}<h1 class="display">It was: ${esc(gs.word)}</h1><button class="btn" data-a='${A({ k: 'skip' })}'>Next drawing</button></div>`;
    }
    if (gs.phase === 'choose') return `<div class="center-stack">${meta}<h1 class="display">${av(dr)} ${esc(dr.name)} is picking a word…</h1>${timer(gs.end, 'big')}</div>`;
    const side = `<div class="feed">${gs.feed.map(f => `<p class="${f.ok ? 'ok' : ''}">${esc(f.n)}${f.ok ? ' got it!' : `: ${esc(f.g)}${f.close ? ' <em>(close!)</em>' : ''}`}</p>`).join('')}</div>
      <div class="mini-board col">${ctx.humans().slice().sort((a, b) => gs.score[b.pid] - gs.score[a.pid]).map(p => `<span class="${gs.correct.includes(p.pid) ? 'got' : ''}">${av(p, 'sm')} ${esc(p.name)} <b>${gs.score[p.pid]}</b></span>`).join('')}</div>`;
    const rev = gs.phase === 'reveal';
    return `<div class="draw-wrap"><div class="draw-main"><div class="qmeta">${meta}<span class="blanks">${rev ? esc(gs.word) : blanks(gs.word, gs.hint)}</span>${rev ? '' : timer(gs.end, 'big')}</div>
      <canvas id="drawtv" class="drawcv"></canvas><p class="muted">${esc(dr.name)} is drawing · ${gs.correct.length} got it</p></div>
      <div class="draw-side">${side}<button class="btn ghost" data-a='${A({ k: 'skip' })}'>${rev ? 'Next' : 'Reveal'}</button></div></div>`;
  },
  tvData(ctx, gs) { return gs.phase === 'draw' || gs.phase === 'reveal' ? { strokes: gs.strokes } : null; },
  afterRemoteTV(el, x) {
    const cv = el.querySelector('#drawtv'); if (!cv) return;
    el._strokes = ((x && x.strokes) || []).map(s => ({ ...s, pts: s.pts.slice() }));
    sizeCanvas(cv); paintAll(cv, el._strokes);
  },
  onRemoteFx(el, fx) {
    const cv = el.querySelector('#drawtv'); if (!cv || !fx) return;
    el._strokes = el._strokes || [];
    if (fx.k === 'clr') { el._strokes = []; paintAll(cv, []); return; }
    if (fx.k !== 'st') return;
    let s = el._strokes.find(x => x.id === fx.id);
    if (!s) { s = { id: fx.id, c: fx.c, w: fx.w, pts: [] }; el._strokes.push(s); }
    if (s.pts.length > fx.from) return; // already have these points
    const from = s.pts.length; s.pts.push(...(fx.pts || [])); paintStroke(cv, s, from);
  },
  afterTV(el, ctx, gs) {
    const cv = el.querySelector('#drawtv'); if (!cv) return;
    sizeCanvas(cv); paintAll(cv, gs.strokes || []);
  },
  phone(ctx, gs, pid) {
    const isDrawer = ctx.solo || pid === gs.drawer;
    if (gs.phase === 'choose') return isDrawer ? { k: 'choose', choices: gs.choices, end: gs.end } : { k: 'wait', drawer: ctx.name(gs.drawer) };
    if (gs.phase === 'draw') {
      if (isDrawer) return { k: 'draw', word: gs.word, end: gs.end, tid: gs.tid, solo: ctx.solo };
      return { k: 'guess', got: gs.correct.includes(pid), end: gs.end, drawer: ctx.name(gs.drawer), len: gs.word.length, blanks: blanks(gs.word, gs.hint) };
    }
    return { k: 'reveal', word: gs.word, got: gs.correct.includes(pid), drawer: isDrawer, n: gs.correct.length, score: gs.score[pid] };
  },
  renderPhone(d) {
    if (d.k === 'choose') return `<div class="center-stack"><h2>Pick your word ${timer(d.end)}</h2>${d.choices.map(w => `<button class="bigchoice" data-a='${A({ k: 'pick', w })}'>${esc(w)}</button>`).join('')}</div>`;
    if (d.k === 'wait') return `<div class="result"><h2>${esc(d.drawer)} is picking a word</h2><p>Get ready to guess</p></div>`;
    if (d.k === 'draw') return `<div class="drawpad" data-tid="${esc(d.tid)}"><div class="qmeta"><span class="pill">Draw: <b>${esc(d.word)}</b></span>${timer(d.end)}</div>
      <canvas class="drawcv mine"></canvas>
      <div class="pens">${PENS.map((c, i) => `<button class="pen ${i ? '' : 'on'}" style="--c:${c}" data-pen="${c}" aria-label="colour"></button>`).join('')}<button class="pen size" data-size="1">S</button><button class="btn ghost sm" data-clear>Clear</button></div>
      ${d.solo ? `<div class="row2"><button class="btn pass" data-a='${A({ k: 'no' })}'>Skip</button><button class="btn got" data-a='${A({ k: 'yes' })}'>They got it!</button></div>` : '<p class="muted small">No letters or numbers o!</p>'}</div>`;
    if (d.k === 'guess') {
      if (d.got) return `<div class="result good"><h2>You got it!</h2><p>Wait for others…</p>${timer(d.end, 'big')}</div>`;
      return `<div class="center-stack"><div class="qmeta"><span class="pill">${esc(d.drawer)} is drawing</span>${timer(d.end)}</div><p class="blanks">${d.blanks}</p>
        <form class="form" data-form="guess" data-clear><input id="dg" name="g" type="text" autocomplete="off" maxlength="30" placeholder="Type your guess" required><button class="btn" type="submit">Guess</button></form><p class="muted small">Watch the drawing and guess fast</p></div>`;
    }
    return `<div class="result ${d.got ? 'good' : ''}"><h2>It was: ${esc(d.word)}</h2><p>${d.drawer ? `${d.n} people got it` : d.got ? 'You got it!' : 'You missed this one'}</p></div>`;
  },
  mountPhone(el, d, send) {
    const pad = el.querySelector('.drawpad'); if (!pad) return;
    const cv = pad.querySelector('canvas'); if (cv._bound) return;
    cv._bound = true; sizeCanvas(cv);
    const local = []; paintAll(cv, local);
    let pen = PENS[0], w = 0.012, curS = null, buf = [], timerH = null;
    const flush = () => { if (curS && buf.length && !d.solo) send({ k: 'st', tid: d.tid, id: curS.id, c: curS.c, w: curS.w, pts: buf }); buf = []; };
    const pos = e => { const r = cv.getBoundingClientRect(); return [+((e.clientX - r.left) / r.width).toFixed(3), +((e.clientY - r.top) / r.height).toFixed(3)]; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); curS = { id: Math.random().toString(36).slice(2, 8), c: pen, w, pts: [pos(e)] }; local.push(curS); buf = [curS.pts[0]]; paintStroke(cv, curS); timerH = setInterval(flush, 90); });
    cv.addEventListener('pointermove', e => { if (!curS) return; const p = pos(e); curS.pts.push(p); buf.push(p); paintStroke(cv, curS, curS.pts.length - 1); });
    const up = () => { if (!curS) return; flush(); clearInterval(timerH); curS = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    pad.querySelectorAll('[data-pen]').forEach(b => b.addEventListener('click', () => { pen = b.dataset.pen; pad.querySelectorAll('[data-pen]').forEach(x => x.classList.toggle('on', x === b)); }));
    const sz = pad.querySelector('[data-size]');
    sz.addEventListener('click', () => { const s = [['S', 0.012], ['M', 0.022], ['L', 0.045]]; const i = (s.findIndex(x => x[0] === sz.textContent) + 1) % 3; sz.textContent = s[i][0]; w = s[i][1]; });
    pad.querySelector('[data-clear]').addEventListener('click', () => { local.length = 0; paintAll(cv, local); if (!d.solo) send({ k: 'clear' }); });
  }
};
