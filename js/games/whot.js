import { shuffle, esc, A, av, timer } from '../ui.js';

const NUMS = {
  circle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14], triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  cross: [1, 2, 3, 5, 7, 10, 11, 13, 14], square: [1, 2, 3, 5, 7, 10, 11, 13, 14], star: [1, 2, 3, 4, 5, 7, 8]
};
export const SHAPES = ['circle', 'triangle', 'cross', 'square', 'star'];
const SPECIAL = { 1: 'Hold on', 2: 'Pick two', 5: 'Pick three', 8: 'Suspension', 14: 'General market', 20: 'Whot' };
const TURN_SECS = 30;

const SVG = {
  circle: '<circle cx="20" cy="20" r="15"/>',
  triangle: '<path d="M20 4 37 35H3z"/>',
  cross: '<path d="M15 3h10v12h12v10H25v12H15V25H3V15h12z"/>',
  square: '<rect x="5" y="5" width="30" height="30"/>',
  star: '<path d="m20 2 5.3 11.6L38 15l-9.4 8.6L31 36l-11-6.3L9 36l2.4-12.4L2 15l12.7-1.4z"/>'
};
export const shapeIcon = s => `<svg viewBox="0 0 40 40" class="shp">${SVG[s] || ''}</svg>`;
export function cardHTML(c, cls = '', attrs = '') {
  if (!c) return '<div class="wcard empty"></div>';
  const mid = c.s === 'whot' ? '<span class="whotw">WHOT</span>' : shapeIcon(c.s);
  return `<div class="wcard s-${c.s} ${cls}" ${attrs}><span class="cn">${c.n}</span>${mid}<span class="cn b">${c.n}</span></div>`;
}

function deck() {
  const d = [];
  for (const s in NUMS) NUMS[s].forEach(n => d.push({ s, n }));
  for (let i = 0; i < 5; i++) d.push({ s: 'whot', n: 20 });
  return shuffle(d);
}
const top = gs => gs.pile[gs.pile.length - 1];
function canPlay(gs, c) {
  const t = top(gs);
  if (gs.pending) return c.n === t.n && (t.n === 2 || t.n === 5);
  if (c.s === 'whot') return true;
  if (gs.need) return c.s === gs.need;
  return c.s === t.s || c.n === t.n;
}
function draw(gs, pid, n) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    if (!gs.market.length) break;
    gs.hands[pid].push(gs.market.pop()); got++;
  }
  return got;
}
const cur = gs => gs.order[gs.turn];

function beginTurn(ctx, gs) {
  if (gs.phase === 'over') return;
  const pid = cur(gs), p = ctx.p(pid);
  gs.end = Date.now() + TURN_SECS * 1000;
  if (p.bot) ctx.after('t', 900 + Math.random() * 700, () => botMove(ctx, gs));
  else ctx.after('t', TURN_SECS * 1000 + 300, () => { if (gs.phase === 'shape') chooseShape(ctx, gs, pid, bestShape(gs.hands[pid])); else goMarket(ctx, gs, pid); });
  ctx.sync();
}
function advance(ctx, gs, steps = 1) { gs.turn = (gs.turn + steps) % gs.order.length; beginTurn(ctx, gs); }
function say(ctx, gs, m) { gs.log.unshift(m); gs.log = gs.log.slice(0, 4); }

function play(ctx, gs, pid, i) {
  if (gs.phase !== 'play' || cur(gs) !== pid) return false;
  const h = gs.hands[pid], c = h[i];
  if (!c || !canPlay(gs, c)) return false;
  h.splice(i, 1); gs.pile.push(c); gs.need = null; ctx.sfx('card');
  const nm = ctx.name(pid);
  say(ctx, gs, `${nm} played ${c.s === 'whot' ? 'WHOT' : c.n + ' ' + c.s}${SPECIAL[c.n] ? ` (${SPECIAL[c.n]})` : ''}`);
  if (!h.length) return win(ctx, gs, pid);
  if (h.length === 1) say(ctx, gs, `${nm}: Last card!`);
  switch (c.n) {
    case 1: say(ctx, gs, `Hold on: ${nm} again`); beginTurn(ctx, gs); break;
    case 2: gs.pending += 2; advance(ctx, gs); break;
    case 5: gs.pending += 3; advance(ctx, gs); break;
    case 8: say(ctx, gs, `${ctx.name(gs.order[(gs.turn + 1) % gs.order.length])} suspended`); advance(ctx, gs, gs.order.length === 2 ? 2 : 2); break;
    case 14: gs.order.forEach(o => { if (o !== pid) draw(gs, o, 1); }); say(ctx, gs, 'General market! Everyone else picks one'); advance(ctx, gs); break;
    case 20: gs.phase = 'shape'; if (ctx.p(pid).bot) chooseShape(ctx, gs, pid, bestShape(h)); else { ctx.cancel('t'); gs.end = Date.now() + TURN_SECS * 1000; ctx.after('t', TURN_SECS * 1000, () => chooseShape(ctx, gs, pid, bestShape(h))); ctx.sync(); } break;
    default: advance(ctx, gs);
  }
  return false;
}
function chooseShape(ctx, gs, pid, s) {
  if (gs.phase !== 'shape' || cur(gs) !== pid || !SHAPES.includes(s)) return false;
  gs.need = s; gs.phase = 'play'; say(ctx, gs, `Shape called: ${s.toUpperCase()}`);
  advance(ctx, gs); return false;
}
function goMarket(ctx, gs, pid) {
  if (gs.phase !== 'play' || cur(gs) !== pid) return false;
  if (!gs.market.length) return stalemate(ctx, gs);
  const n = gs.pending || 1; const got = draw(gs, pid, n);
  say(ctx, gs, `${ctx.name(pid)} went to market${n > 1 ? ` (picked ${got})` : ''}`);
  gs.pending = 0; ctx.sfx('card');
  advance(ctx, gs); return false;
}
function cardValue(h) { return h.reduce((s, c) => s + (c.s === 'star' ? c.n * 2 : c.n), 0); }
function stalemate(ctx, gs) {
  const best = gs.order.slice().sort((a, b) => cardValue(gs.hands[a]) - cardValue(gs.hands[b]))[0];
  say(ctx, gs, 'Market don finish! Count your cards, lowest total wins'); gs.tender = true; return win(ctx, gs, best);
}
function win(ctx, gs, pid) {
  gs.phase = 'over'; gs.winner = pid; ctx.cancel('t'); say(ctx, gs, `${gs.tender ? "" : "Check up! "}Winner: ${ctx.name(pid)}`);
  ctx.sfx('win'); ctx.sync();
  ctx.after('fin', 3500, () => {
    const scores = {}; gs.order.forEach(o => { scores[o] = o === pid ? 1000 : gs.tender ? -cardValue(gs.hands[o]) : -gs.hands[o].length; });
    ctx.finish(scores, { title: gs.tender ? `Market finish! Lowest cards: ${ctx.name(pid)}` : `${ctx.name(pid)} checked up!`, lines: gs.order.filter(o => o !== pid).map(o => `${esc(ctx.name(o))}: ${gs.hands[o].length} cards left${gs.tender ? `, worth ${cardValue(gs.hands[o])}` : ''}`), unit: '' });
  });
  return false;
}
function bestShape(h) {
  const c = {}; h.forEach(x => { if (x.s !== 'whot') c[x.s] = (c[x.s] || 0) + 1; });
  return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || SHAPES[Math.random() * 5 | 0];
}
function botMove(ctx, gs) {
  const pid = cur(gs), h = gs.hands[pid];
  if (gs.phase === 'shape') return chooseShape(ctx, gs, pid, bestShape(h));
  const ok = h.map((c, i) => ({ c, i })).filter(x => canPlay(gs, x.c));
  if (!ok.length) return goMarket(ctx, gs, pid);
  const next = gs.order[(gs.turn + 1) % gs.order.length];
  const danger = gs.hands[next].length <= 3;
  const score = ({ c }) => (c.s === 'whot' ? -5 : 0) + ([2, 5, 8, 14].includes(c.n) ? (danger ? 6 : 2) : 0) + (c.n === 1 ? 3 : 0) + Math.random();
  ok.sort((a, b) => score(b) - score(a));
  play(ctx, gs, pid, ok[0].i);
}

export default {
  id: 'whot', name: 'Whot!', color: '#c2185b', glyph: 'W',
  blurb: 'The classic Naija card game. Your hand is on your phone. Hold on, pick two, general market!',
  players: '2–6 (CPU can fill in)', min: 1, max: 6, solo: 'full', cpu: { max: 5, soloDef: 2 },
  options: [{ key: 'hand', label: 'Cards each', choices: [[4, '4'], [5, '5'], [6, '6']], def: 5 }],
  rules: 'When the market finishes, everyone counts their cards and the lowest total wins (stars count double). 1 Hold on (play again) · 2 Pick two · 5 Pick three · 8 Suspension · 14 General market · 20 Whot (call a shape). You can block a pick two with a 2, or a pick three with a 5.',
  start(ctx, o) {
    const gs = { market: deck(), pile: [], hands: {}, order: shuffle(ctx.players.map(p => p.pid)), turn: 0, pending: 0, need: null, phase: 'play', log: [] };
    gs.order.forEach(pid => { gs.hands[pid] = []; draw(gs, pid, +o.hand || 5); });
    let i = gs.market.findIndex(c => !SPECIAL[c.n]); gs.pile.push(gs.market.splice(i, 1)[0]);
    say(ctx, gs, `First turn: ${ctx.name(gs.order[0])}`);
    beginTurn(ctx, gs);
    return gs;
  },
  act(ctx, gs, pid, a) {
    if (a.k === 'play') return play(ctx, gs, pid, +a.i);
    if (a.k === 'market') return goMarket(ctx, gs, pid);
    if (a.k === 'shape') return chooseShape(ctx, gs, pid, a.s);
    return false;
  },
  tv(ctx, gs) {
    const t = top(gs);
    const seats = gs.order.map((pid, i) => { const p = ctx.p(pid), n = gs.hands[pid].length; return `<div class="seat ${i === gs.turn && gs.phase !== 'over' ? 'on' : ''} ${gs.winner === pid ? 'won' : ''}">${av(p)}<b>${esc(p.name)}</b><span class="cc">${n} card${n === 1 ? '' : 's'}</span>${n === 1 ? '<em class="lc">Last card</em>' : ''}${i === gs.turn && gs.phase !== 'over' && !p.bot ? timer(gs.end, 'sm') : ''}</div>`; }).join('');
    return `<div class="whot-table"><div class="seats">${seats}</div>
      <div class="felt"><div class="stackm"><div class="wcard back"><span>WHOT</span></div><small>Market ${gs.market.length}</small></div>
        <div class="stackm">${cardHTML(t, 'big')}<small>${gs.need ? `Wants <b>${gs.need.toUpperCase()}</b> ${shapeIcon(gs.need)}` : gs.pending ? `<b class="hot">Pick ${gs.pending}!</b>` : '&nbsp;'}</small></div></div>
      <div class="log">${gs.log.map((l, i) => `<p class="${i ? 'old' : ''}">${esc(l)}</p>`).join('')}</div></div>`;
  },
  phone(ctx, gs, pid) {
    const mine = cur(gs) === pid && gs.phase !== 'over';
    return { k: gs.phase, mine, turnName: ctx.name(cur(gs)), top: top(gs), need: gs.need, pending: gs.pending, end: gs.end, winner: gs.winner ? ctx.name(gs.winner) : null, won: gs.winner === pid,
      hand: gs.hands[pid].map((c, i) => ({ ...c, i, ok: mine && gs.phase === 'play' && canPlay(gs, c) })), solo: ctx.solo };
  },
  renderPhone(d) {
    if (d.k === 'over') return `<div class="result ${d.won ? 'good' : ''}"><h2>${d.won ? 'Check up! You win!' : `${esc(d.winner)} checked up`}</h2></div>`;
    const status = d.mine ? (d.k === 'shape' ? 'Call a shape' : d.pending ? `Pick ${d.pending}, or block it` : 'Your turn!') : `${esc(d.turnName)}’s turn`;
    const head = `<div class="qmeta"><span class="pill ${d.mine ? 'hotpill' : ''}">${status}</span>${d.mine ? timer(d.end) : ''}</div>`;
    const topRow = d.solo ? '' : `<div class="ptop">${cardHTML(d.top, 'sm')}<span>${d.need ? `Wants ${shapeIcon(d.need)} ${d.need}` : d.pending ? `<b class="hot">Pick ${d.pending}!</b>` : 'On top'}</span></div>`;
    if (d.k === 'shape' && d.mine) return `${head}<div class="shapes">${SHAPES.map(s => `<button class="shapebtn" data-a='${A({ k: 'shape', s })}'>${shapeIcon(s)}<span>${s}</span></button>`).join('')}</div>`;
    const sorted = d.hand.slice().sort((a, b) => (a.s > b.s ? 1 : a.s < b.s ? -1 : a.n - b.n));
    return `${head}${topRow}<div class="hand">${sorted.map(c => cardHTML(c, c.ok ? 'ok' : d.mine ? 'no' : '', c.ok ? `data-a='${A({ k: 'play', i: c.i })}' role="button" tabindex="0"` : '')).join('')}</div>
      ${d.mine && d.k === 'play' ? `<button class="btn market" data-a='${A({ k: 'market' })}'>${d.pending ? `Go market (pick ${d.pending})` : 'Go market'}</button>` : ''}`;
  }
};
