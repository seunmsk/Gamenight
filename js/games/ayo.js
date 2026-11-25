import { esc, A, av, timer } from '../ui.js';

const TURN_SECS = 40;
const sideOf = p => p < 6 ? 0 : 1;
const range = s => s === 0 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11];
const total = (b, s) => range(s).reduce((t, i) => t + b[i], 0);

function applyMove(b0, i, side) {
  const b = b0.slice(); let n = b[i]; b[i] = 0; let pos = i;
  while (n > 0) { pos = (pos + 1) % 12; if (pos === i) continue; b[pos]++; n--; }
  const opp = 1 - side, lo = opp ? 6 : 0, hi = opp ? 11 : 5;
  let caps = [];
  if (pos >= lo && pos <= hi) { let p = pos; while (p >= lo && (b[p] === 2 || b[p] === 3)) { caps.push(p); p--; } }
  const capT = caps.reduce((t, p) => t + b[p], 0);
  if (caps.length && capT === total(b, opp)) caps = []; // no grand slam: you can't take all their seeds
  let cap = 0; caps.forEach(p => { cap += b[p]; b[p] = 0; });
  return { b, cap, caps };
}
function legal(b, side) {
  const own = range(side).filter(i => b[i] > 0);
  if (total(b, 1 - side) > 0) return own;
  return own.filter(i => total(applyMove(b, i, side).b, 1 - side) > 0);
}
function search(b, side, depth, me) {
  const ms = legal(b, side);
  if (!ms.length || depth === 0) return { v: 0 };
  let best = { v: side === me ? -1e9 : 1e9, m: ms[0] };
  for (const m of ms) {
    const r = applyMove(b, m, side);
    const gain = side === me ? r.cap : -r.cap;
    const v = gain + search(r.b, 1 - side, depth - 1, me).v * 0.95;
    if (side === me ? v > best.v : v < best.v) best = { v, m };
  }
  return best;
}
function botMove(gs) {
  const s = gs.turn, ms = legal(gs.b, s);
  if (gs.level === 'easy') {
    if (Math.random() < 0.5) return ms[Math.random() * ms.length | 0];
    return search(gs.b, s, 1, s).m;
  }
  return search(gs.b, s, 5, s).m;
}

function beginTurn(ctx, gs) {
  if (gs.over) return;
  const ms = legal(gs.b, gs.turn);
  if (!ms.length) {
    const rest = gs.b.reduce((t, x) => t + x, 0);
    const who = total(gs.b, gs.turn) === 0 ? 1 - gs.turn : gs.turn;
    gs.cap[who] += rest; gs.b = gs.b.map(() => 0);
    gs.msg = `No more moves. Last ${rest} seeds go to ${ctx.name(gs.seats[who])}.`;
    return end(ctx, gs);
  }
  if (gs.moves > 220 && gs.b.reduce((t, x) => t + x, 0) <= 8) {
    gs.cap[0] += total(gs.b, 0); gs.cap[1] += total(gs.b, 1); gs.b = gs.b.map(() => 0); gs.msg = 'The seeds keep going round. Each side keeps its own.'; return end(ctx, gs);
  }
  gs.end = Date.now() + TURN_SECS * 1000;
  const pid = gs.seats[gs.turn];
  if (ctx.p(pid).bot) ctx.after('t', 900, () => doMove(ctx, gs, pid, botMove(gs)));
  else ctx.after('t', TURN_SECS * 1000 + 300, () => doMove(ctx, gs, pid, ms[Math.random() * ms.length | 0]));
  ctx.sync();
}
function doMove(ctx, gs, pid, i) {
  if (gs.over || gs.seats[gs.turn] !== pid || !legal(gs.b, gs.turn).includes(i)) return false;
  ctx.cancel('t');
  const r = applyMove(gs.b, i, gs.turn);
  gs.b = r.b; gs.cap[gs.turn] += r.cap; gs.last = i; gs.lastCaps = r.caps; gs.moves++;
  gs.msg = r.cap ? `${ctx.name(pid)} captured ${r.cap}!` : `${ctx.name(pid)} sowed from pit ${(i % 6) + 1}`;
  ctx.sfx(r.cap ? 'ok' : 'card');
  if (gs.cap[gs.turn] > 24) return end(ctx, gs);
  gs.turn = 1 - gs.turn; beginTurn(ctx, gs); return false;
}
function end(ctx, gs) {
  gs.over = true; ctx.cancel('t');
  const w = gs.cap[0] === gs.cap[1] ? -1 : gs.cap[0] > gs.cap[1] ? 0 : 1;
  gs.msg = (gs.msg ? gs.msg + ' ' : '') + (w < 0 ? 'It’s a draw!' : `Winner: ${ctx.name(gs.seats[w])}!`);
  ctx.sfx('win'); ctx.sync();
  ctx.after('fin', 3500, () => ctx.finish({ [gs.seats[0]]: gs.cap[0], [gs.seats[1]]: gs.cap[1] }, { title: w < 0 ? 'Draw!' : `Ayo winner: ${ctx.name(gs.seats[w])}`, unit: 'seeds' }));
  return false;
}

function pitHTML(n, i, can, hl) {
  const dots = Array.from({ length: Math.min(n, 14) }, (_, k) => `<i style="--a:${(k * 137) % 360}deg;--d:${k < 1 ? 0 : 0.55 + (k % 3) * 0.3}"></i>`).join('');
  return `<button class="pit ${can ? 'can' : ''} ${hl ? 'hl' : ''}" ${can ? `data-a='${A({ k: 'sow', i })}'` : 'disabled'}><span class="seeds">${dots}</span><b>${n}</b></button>`;
}
function boardHTML(gs, mySide, canSet) {
  const bottom = mySide === 1 ? [6, 7, 8, 9, 10, 11] : [0, 1, 2, 3, 4, 5];
  const topRow = mySide === 1 ? [5, 4, 3, 2, 1, 0] : [11, 10, 9, 8, 7, 6];
  const row = ids => ids.map(i => pitHTML(gs.b[i], i, canSet.has(i), gs.last === i || (gs.lastCaps || []).includes(i))).join('');
  return `<div class="ayo"><div class="ayo-row">${row(topRow)}</div><div class="ayo-row">${row(bottom)}</div></div>`;
}

export default {
  id: 'ayo', name: 'Ayo', color: '#8d5524', glyph: 'O',
  blurb: 'The seed-counting board game. Two players, or you vs CPU. Others watch on the big screen.',
  players: '2 (or 1 vs CPU)', min: 1, max: 2, solo: 'full', cpu: { max: 1, soloDef: 1, fill: 2 },
  options: [{ key: 'level', label: 'CPU level', choices: [['easy', 'Easy'], ['hard', 'Hard']], def: 'easy' }],
  rules: 'Sow seeds anticlockwise, one per pit. If your last seed lands on their side and makes 2 or 3, you capture it, plus any 2s and 3s just before it. More than 24 seeds wins. If their side is empty, you must give them seeds.',
  start(ctx, o) {
    const seats = ctx.players.slice(0, 2).map(p => p.pid);
    const gs = { seats, b: Array(12).fill(4), cap: [0, 0], turn: 0, moves: 0, level: o.level || 'easy', msg: `First move: ${ctx.name(seats[0])}`, last: -1 };
    beginTurn(ctx, gs);
    return gs;
  },
  act(ctx, gs, pid, a) {
    if (a.k !== 'sow') return false;
    const turnPid = gs.seats[gs.turn];
    if (ctx.solo) { if (ctx.p(turnPid).bot) return false; pid = turnPid; }
    return doMove(ctx, gs, pid, +a.i);
  },
  tv(ctx, gs) {
    const p0 = ctx.p(gs.seats[0]), p1 = ctx.p(gs.seats[1]);
    const soloMine = ctx.solo && !gs.over && !ctx.p(gs.seats[gs.turn]).bot;
    const can = soloMine ? new Set(legal(gs.b, gs.turn)) : new Set();
    const side = s => `<div class="ayo-player ${gs.turn === s && !gs.over ? 'on' : ''}">${av(ctx.p(gs.seats[s]))}<b>${esc(ctx.p(gs.seats[s]).name)}</b><span class="store">${gs.cap[s]}</span>${gs.turn === s && !gs.over && !ctx.p(gs.seats[s]).bot ? timer(gs.end, 'sm') : ''}</div>`;
    const mySide = ctx.solo ? Math.max(0, gs.seats.findIndex(x => !ctx.p(x).bot)) : 0;
    return `<div class="ayo-wrap">${side(1 - mySide)}${boardHTML(gs, mySide, can)}${side(mySide)}<p class="lead">${esc(gs.msg)}</p>${soloMine ? '<p class="muted">Tap one of your pits (bottom row)</p>' : ''}</div>`;
  },
  phone(ctx, gs, pid) {
    const s = gs.seats.indexOf(pid);
    return { solo: ctx.solo, side: s, b: gs.b, cap: gs.cap, turn: gs.turn, mine: gs.turn === s && !gs.over, legal: gs.turn === s ? legal(gs.b, s) : [], msg: gs.msg, end: gs.end, last: gs.last, lastCaps: gs.lastCaps, over: gs.over, opp: ctx.name(gs.seats[1 - s]) };
  },
  renderPhone(d) {
    if (d.solo) return '';
    const can = new Set(d.mine ? d.legal : []);
    return `<div class="qmeta"><span class="pill ${d.mine ? 'hotpill' : ''}">${d.over ? 'Game over' : d.mine ? 'Your turn' : esc(d.opp) + '’s turn'}</span>${d.mine ? timer(d.end) : ''}</div>
      <div class="ayo-score"><span>${esc(d.opp)}: <b>${d.cap[1 - d.side]}</b></span><span>You: <b>${d.cap[d.side]}</b></span></div>
      ${boardHTML(d, d.side, can)}<p class="muted">${esc(d.msg)}</p><p class="muted small">Your pits are the bottom row.</p>`;
  }
};
