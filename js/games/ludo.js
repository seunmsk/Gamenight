import { esc, A, av, timer } from '../ui.js';

// 52-square track on a 15x15 grid, clockwise from red's start.
const TRACK = (() => {
  const t = [];
  for (let c = 1; c <= 5; c++) t.push([6, c]);
  for (let r = 5; r >= 0; r--) t.push([r, 6]);
  t.push([0, 7], [0, 8]);
  for (let r = 1; r <= 5; r++) t.push([r, 8]);
  for (let c = 9; c <= 14; c++) t.push([6, c]);
  t.push([7, 14], [8, 14]);
  for (let c = 13; c >= 9; c--) t.push([8, c]);
  for (let r = 9; r <= 14; r++) t.push([r, 8]);
  t.push([14, 7], [14, 6]);
  for (let r = 13; r >= 9; r--) t.push([r, 6]);
  for (let c = 5; c >= 0; c--) t.push([8, c]);
  t.push([7, 0], [6, 0]);
  return t;
})();
const COLS = {
  red: { start: 0, hex: '#e63946', home: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]], yard: [0, 0] },
  green: { start: 13, hex: '#2a9d4b', home: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]], yard: [0, 9] },
  yellow: { start: 26, hex: '#f2b705', home: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]], yard: [9, 9] },
  blue: { start: 39, hex: '#2f6fdf', home: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]], yard: [9, 0] }
};
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const FINISH = 56; // progress: -1 yard, 0..50 track, 51..55 home column, 56 home
const TURN_SECS = 25;

const absIdx = (col, p) => (COLS[col].start + p) % 52;
function cellOf(col, p, k) {
  if (p < 0) { const [r, c] = COLS[col].yard; return [r + 1.5 + (k >> 1) * 2 + 0.5, c + 1.5 + (k & 1) * 2 + 0.5]; }
  if (p >= FINISH) return [7.5 + (k >> 1) * 0.4 - 0.2, 7.5 + (k & 1) * 0.4 - 0.2];
  if (p > 50) { const [r, c] = COLS[col].home[p - 51]; return [r + 0.5, c + 0.5]; }
  const [r, c] = TRACK[absIdx(col, p)]; return [r + 0.5, c + 0.5];
}
function moves(gs, col, d) {
  return gs.tok[col].map((p, i) => ({ i, p })).filter(({ p }) => (p < 0 ? d === 6 : p < FINISH && p + d <= FINISH)).map(x => x.i);
}
const cur = gs => gs.seats[gs.turn];

function beginTurn(ctx, gs) {
  if (gs.over) return;
  gs.phase = 'roll';
  const s = cur(gs);
  gs.end = Date.now() + TURN_SECS * 1000;
  if (ctx.p(s.pid).bot) ctx.after('t', 800, () => roll(ctx, gs, s.pid));
  else ctx.after('t', TURN_SECS * 1000 + 300, () => { if (gs.phase === 'roll') roll(ctx, gs, s.pid); });
  ctx.sync();
}
function nextTurn(ctx, gs, again) {
  if (!again) { gs.turn = (gs.turn + 1) % gs.seats.length; gs.sixes = 0; }
  beginTurn(ctx, gs);
}
function roll(ctx, gs, pid) {
  const s = cur(gs); if (gs.phase !== 'roll' || s.pid !== pid) return false;
  const d = 1 + (Math.random() * 6 | 0); gs.dice = d; ctx.sfx('dice');
  gs.msg = `${ctx.name(pid)} rolled ${d}`;
  if (d === 6) gs.sixes++;
  if (gs.sixes >= 3) { gs.msg += '. Three sixes, turn lost!'; gs.phase = 'wait'; ctx.sync(); ctx.after('t', 1300, () => nextTurn(ctx, gs, false)); return false; }
  const ms = moves(gs, s.col, d);
  if (!ms.length) { gs.phase = 'wait'; gs.msg += ', no move'; ctx.sync(); ctx.after('t', 1300, () => nextTurn(ctx, gs, false)); return false; }
  gs.phase = 'move'; gs.valid = ms;
  const distinct = new Set(ms.map(i => gs.tok[s.col][i]));
  if (ctx.p(pid).bot) ctx.after('t', 700, () => move(ctx, gs, pid, botPick(gs, s.col, d, ms)));
  else if (distinct.size === 1) ctx.after('t', 600, () => move(ctx, gs, pid, ms[0]));
  else { gs.end = Date.now() + TURN_SECS * 1000; ctx.after('t', TURN_SECS * 1000, () => move(ctx, gs, pid, ms[0])); }
  ctx.sync(); return false;
}
function move(ctx, gs, pid, i) {
  const s = cur(gs); if (gs.phase !== 'move' || s.pid !== pid || !gs.valid.includes(i)) return false;
  ctx.cancel('t');
  const t = gs.tok[s.col], d = gs.dice;
  t[i] = t[i] < 0 ? 0 : t[i] + d;
  let bonus = d === 6, cap = false;
  if (t[i] <= 50) {
    const ai = absIdx(s.col, t[i]);
    if (!SAFE.has(ai)) for (const o of gs.seats) if (o.col !== s.col) gs.tok[o.col].forEach((op, j) => {
      if (op >= 0 && op <= 50 && absIdx(o.col, op) === ai) { gs.tok[o.col][j] = -1; cap = true; gs.msg = `${ctx.name(pid)} knocked ${ctx.name(o.pid)} back home!`; }
    });
  }
  if (cap) { bonus = true; ctx.sfx('ok'); }
  if (t[i] === FINISH) { bonus = true; gs.msg = `${ctx.name(pid)} got a token home!`; ctx.sfx('ok'); }
  if (t.every(p => p === FINISH)) return win(ctx, gs, s);
  gs.phase = 'wait'; ctx.sync();
  ctx.after('t', 500, () => nextTurn(ctx, gs, bonus));
  return false;
}
function botPick(gs, col, d, ms) {
  let best = ms[0], bs = -1e9;
  for (const i of ms) {
    const p = gs.tok[col][i], np = p < 0 ? 0 : p + d; let sc = 0;
    if (np === FINISH) sc += 50;
    if (p < 0) sc += 30;
    if (np <= 50) {
      const ai = absIdx(col, np);
      for (const o of gs.seats) if (o.col !== col) gs.tok[o.col].forEach(op => { if (op >= 0 && op <= 50 && absIdx(o.col, op) === ai && !SAFE.has(ai)) sc += 60; });
      if (SAFE.has(ai)) sc += 8;
    } else sc += 15;
    sc += np * 0.3 + Math.random();
    if (sc > bs) { bs = sc; best = i; }
  }
  return best;
}
function win(ctx, gs, s) {
  gs.over = true; gs.winner = s.pid; gs.msg = `Winner: ${ctx.name(s.pid)}!`; gs.phase = 'wait';
  ctx.sfx('win'); ctx.sync();
  ctx.after('fin', 3000, () => {
    const scores = {}; gs.seats.forEach(x => { scores[x.pid] = gs.tok[x.col].reduce((a, p) => a + Math.max(0, p + 1), 0) + (x.pid === s.pid ? 1000 : 0); });
    ctx.finish(scores, { title: `Ludo winner: ${ctx.name(s.pid)}`, unit: '' });
  });
  return false;
}

function boardSVG(ctx, gs, clickable) {
  let g = '';
  for (const col in COLS) { const [r, c] = COLS[col].yard, h = COLS[col].hex; g += `<rect x="${c}" y="${r}" width="6" height="6" fill="${h}" rx=".3"/><rect x="${c + .8}" y="${r + .8}" width="4.4" height="4.4" fill="#fff8ee" rx=".3"/>`; for (let k = 0; k < 4; k++) g += `<circle cx="${c + 2 + (k & 1) * 2}" cy="${r + 2 + (k >> 1) * 2}" r=".7" fill="${h}" opacity=".25"/>`; }
  TRACK.forEach(([r, c], i) => {
    let f = '#fff8ee';
    for (const col in COLS) if (COLS[col].start === i) f = COLS[col].hex;
    g += `<rect x="${c + .04}" y="${r + .04}" width=".92" height=".92" fill="${f}" stroke="#d9cbb5" stroke-width=".04"/>`;
    if (SAFE.has(i) && f === '#fff8ee') g += `<path transform="translate(${c + .5} ${r + .5}) scale(.018)" d="m0 -20 6 13 14 1-11 9 4 14-13-8-13 8 4-14-11-9 14-1z" fill="#c9b48f"/>`;
  });
  for (const col in COLS) COLS[col].home.forEach(([r, c]) => { g += `<rect x="${c + .04}" y="${r + .04}" width=".92" height=".92" fill="${COLS[col].hex}" opacity=".85"/>`; });
  g += `<path d="M6 6 7.5 7.5 6 9z" fill="${COLS.red.hex}"/><path d="M6 6 9 6 7.5 7.5z" fill="${COLS.green.hex}"/><path d="M9 6 9 9 7.5 7.5z" fill="${COLS.yellow.hex}"/><path d="M6 9 9 9 7.5 7.5z" fill="${COLS.blue.hex}"/>`;
  const s = cur(gs);
  for (const x of gs.seats) gs.tok[x.col].forEach((p, k) => {
    const [cy, cx] = cellOf(x.col, p, k);
    const can = clickable && gs.phase === 'move' && x === s && gs.valid.includes(k);
    g += `<g class="tok ${can ? 'can' : ''}" ${can ? `data-a='${A({ k: 'move', i: k })}'` : ''}><circle cx="${cx}" cy="${cy + .06}" r=".38" fill="#0004"/><circle cx="${cx}" cy="${cy}" r=".38" fill="${COLS[x.col].hex}" stroke="#fff" stroke-width=".09"/>${can ? `<circle cx="${cx}" cy="${cy}" r=".5" fill="none" stroke="#fff" stroke-width=".07" class="pulse"/>` : ''}</g>`;
  });
  return `<svg class="ludo" viewBox="-.2 -.2 15.4 15.4"><rect x="-.2" y="-.2" width="15.4" height="15.4" rx=".4" fill="#3b2a1a"/>${g}</svg>`;
}
const dieFace = d => `<span class="die d${d}">${d ? Array.from({ length: d }, () => '<i></i>').join('') : ''}</span>`;

export default {
  id: 'ludo', name: 'Ludo', color: '#2f6fdf', glyph: '6',
  blurb: 'Roll, race and knock people back home. 2 to 4 players, CPU fills empty seats.',
  players: '2–4 (CPU can fill in)', min: 1, max: 4, solo: 'full', cpu: { max: 3, soloDef: 1 },
  options: [{ key: 'tokens', label: 'Tokens each', choices: [[2, '2 (quick game)'], [4, '4 (full game)']], def: 2 }],
  rules: 'Roll a 6 to come out. 6, a knock-out or getting home gives another roll. Three 6s in a row loses the turn. Star and start squares are safe.',
  start(ctx, o) {
    const n = ctx.players.length;
    const order = n === 2 ? ['red', 'yellow'] : ['red', 'green', 'yellow', 'blue'];
    const seats = ctx.players.slice(0, 4).map((p, i) => ({ pid: p.pid, col: order[i] }));
    const nt = +o.tokens || 2;
    const tok = {}; seats.forEach(s => { tok[s.col] = Array(nt).fill(-1); });
    const gs = { seats, tok, turn: 0, phase: 'roll', dice: 0, sixes: 0, msg: `First roll: ${ctx.name(seats[0].pid)}`, valid: [] };
    beginTurn(ctx, gs);
    return gs;
  },
  act(ctx, gs, pid, a) {
    const s = cur(gs);
    const me = ctx.solo ? (ctx.p(s.pid).bot ? null : s.pid) : pid;
    if (a.k === 'roll') return roll(ctx, gs, me);
    if (a.k === 'move') return move(ctx, gs, me, +a.i);
    return false;
  },
  tv(ctx, gs) {
    const s = cur(gs);
    const seats = gs.seats.map(x => { const p = ctx.p(x.pid); const home = gs.tok[x.col].filter(t => t === FINISH).length; return `<div class="seat ${x === s && !gs.over ? 'on' : ''}" style="--c:${COLS[x.col].hex}">${av(p)}<b>${esc(p.name)}</b><span class="cc">${home}/${gs.tok[x.col].length} home</span></div>`; }).join('');
    const mine = ctx.solo && !ctx.p(s.pid).bot;
    return `<div class="ludo-wrap"><div class="ludo-board">${boardSVG(ctx, gs, mine || !ctx.solo && false)}</div>
      <div class="ludo-side"><div class="seats col">${seats}</div>
      <div class="ludo-ctl"><div class="dicebox" style="--c:${COLS[s.col].hex}">${dieFace(gs.dice)}<p>${esc(gs.msg || '')}</p>${!ctx.p(s.pid).bot && !gs.over ? timer(gs.end, 'sm') : ''}</div>
      ${mine && gs.phase === 'roll' ? `<button class="btn huge rollbtn" data-a='${A({ k: 'roll' })}'>Roll</button>` : ''}${mine && gs.phase === 'move' ? '<p class="lead tapnote">Tap a glowing token</p>' : ''}</div></div></div>`;
  },
  phone(ctx, gs, pid) {
    const s = cur(gs), seat = gs.seats.find(x => x.pid === pid);
    const mine = s.pid === pid && !gs.over;
    return { solo: ctx.solo, col: seat && seat.col, hex: seat && COLS[seat.col].hex, mine, phase: gs.phase, dice: gs.dice, msg: gs.msg, end: gs.end, turnName: ctx.name(s.pid), over: gs.over, won: gs.winner === pid,
      toks: seat ? gs.tok[seat.col].map((p, i) => ({ i, p, can: mine && gs.phase === 'move' && gs.valid.includes(i) })) : [] };
  },
  renderPhone(d) {
    if (d.solo) return '';
    if (d.over) return `<div class="result ${d.won ? 'good' : ''}"><h2>${d.won ? 'You win!' : esc(d.msg)}</h2></div>`;
    const label = p => p < 0 ? 'In the yard' : p >= FINISH ? 'Home' : p > 50 ? `${FINISH - p} to home` : `${FINISH - p} steps to go`;
    return `<div class="teamtag" style="--c:${d.hex}">You are ${d.col}</div>
      <div class="qmeta"><span class="pill ${d.mine ? 'hotpill' : ''}">${d.mine ? 'Your turn!' : esc(d.turnName) + '’s turn'}</span>${d.mine ? timer(d.end) : ''}</div>
      <div class="dicebox" style="--c:${d.hex}">${dieFace(d.dice)}<p>${esc(d.msg || '')}</p></div>
      ${d.mine && d.phase === 'roll' ? `<button class="btn huge" data-a='${A({ k: 'roll' })}'>Roll</button>` : ''}
      <div class="toklist">${d.toks.map(t => `<button class="tokbtn ${t.can ? 'can' : ''}" style="--c:${d.hex}" ${t.can ? '' : 'disabled'} data-a='${A({ k: 'move', i: t.i })}'><i></i>Token ${t.i + 1}<span>${label(t.p)}</span></button>`).join('')}</div>`;
  }
};
