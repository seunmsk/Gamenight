// Shared timed multiple-choice runner (How Naija, Jollof Wars)
import { esc, A, timer, av, shuffle } from '../ui.js';
export const LET = ['A', 'B', 'C', 'D'];

export function prepQs(list) {
  return list.map(q => { const idx = shuffle(q.o.map((_, i) => i)); return { q: q.q, o: idx.map(i => q.o[i]), a: idx.indexOf(q.a) }; });
}

export function qBegin(ctx, gs, list, secs, done, hook) {
  gs.Q = { list, i: -1, secs, ans: {}, gain: {}, phase: 'q', end: 0 };
  gs.Qdone = done; gs.Qhook = hook;
  gs.score = gs.score || {}; gs.right = gs.right || {};
  ctx.humans().forEach(p => { gs.score[p.pid] ??= 0; gs.right[p.pid] ??= 0; });
  qNext(ctx, gs);
}

export function qNext(ctx, gs) {
  const Q = gs.Q; Q.i++;
  if (Q.i >= Q.list.length) { gs.Q = null; gs.Qdone(); return; }
  Q.ans = {}; Q.gain = {}; Q.phase = 'q'; Q.start = Date.now(); Q.end = Q.start + Q.secs * 1000;
  ctx.after('q', Q.secs * 1000 + 300, () => qReveal(ctx, gs));
  ctx.sync();
}

export function qAnswer(ctx, gs, pid, i) {
  const Q = gs.Q; if (!Q || Q.phase !== 'q' || Q.ans[pid] || !(i >= 0 && i < Q.list[Q.i].o.length)) return false;
  Q.ans[pid] = { i, t: Date.now() };
  const waiting = ctx.humans().filter(p => ctx.online(p.pid) && !Q.ans[p.pid]);
  if (!waiting.length) qReveal(ctx, gs); else ctx.sync();
  return false;
}

export function qReveal(ctx, gs) {
  const Q = gs.Q; if (!Q || Q.phase !== 'q') return;
  ctx.cancel('q'); Q.phase = 'reveal';
  const cur = Q.list[Q.i], total = Q.secs * 1000;
  let anyRight = false;
  for (const pid in Q.ans) {
    const a = Q.ans[pid];
    if (a.i === cur.a) {
      const left = Math.max(0, Q.end - a.t);
      const pts = 500 + Math.round(500 * left / total);
      Q.gain[pid] = pts; gs.score[pid] = (gs.score[pid] || 0) + pts; gs.right[pid] = (gs.right[pid] || 0) + 1; anyRight = true;
    }
  }
  if (gs.Qhook) gs.Qhook(ctx, gs, cur);
  ctx.sfx(anyRight ? 'ok' : 'bad');
  ctx.after('q', 5000, () => qNext(ctx, gs));
  ctx.sync();
}

export function qSkip(ctx, gs) {
  const Q = gs.Q; if (!Q) return false;
  if (Q.phase === 'q') qReveal(ctx, gs); else { ctx.cancel('q'); qNext(ctx, gs); }
  return false;
}

export function qTV(ctx, gs, opts = {}) {
  const Q = gs.Q; if (!Q) return '';
  const cur = Q.list[Q.i], rev = Q.phase === 'reveal';
  const by = i => ctx.humans().filter(p => Q.ans[p.pid] && Q.ans[p.pid].i === i);
  const click = ctx.solo && !rev;
  const opt = (o, i) => `<${click ? 'button' : 'div'} class="opt o${i} ${rev ? (i === cur.a ? 'right' : 'dim') : ''}" ${click ? `data-a='${A({ k: 'ans', i })}'` : ''}><b>${opts.tf ? '' : LET[i]}</b><span>${esc(o)}</span>${rev && !ctx.solo ? `<i class="who">${by(i).map(p => av(p, 'sm')).join('')}</i>` : ''}${rev && ctx.solo && Q.ans.me && Q.ans.me.i === i ? '<i class="who mine">Your pick</i>' : ''}</${click ? 'button' : 'div'}>`;
  const answered = ctx.humans().filter(p => Q.ans[p.pid]);
  const top = ctx.humans().map(p => ({ p, s: gs.score[p.pid] || 0 })).sort((a, b) => b.s - a.s).slice(0, 6);
  return `<div class="quiz">
    <div class="qmeta"><span class="pill">${esc(opts.label || 'Question')} ${Q.i + 1} of ${Q.list.length}</span>${rev ? '' : timer(Q.end, 'big')}</div>
    <h1 class="qtext">${esc(cur.q)}</h1>
    <div class="opts ${opts.tf ? 'tf' : ''}">${cur.o.map(opt).join('')}</div>
    <div class="qfoot">${rev
      ? `<div class="mini-board">${top.map(({ p, s }) => `<span>${av(p, 'sm')} ${esc(p.name)} <b>${s}</b>${Q.gain[p.pid] ? ` <em>+${Q.gain[p.pid]}</em>` : ''}</span>`).join('')}</div>`
      : ctx.solo ? '<span></span>' : `<div class="answered">${answered.map(p => av(p, 'sm')).join('')}<span>${answered.length}/${ctx.humans().length} locked in</span></div>`}
      ${ctx.solo && !rev ? '' : `<button class="btn ghost" data-a='${A({ k: 'skip' })}'>${rev ? 'Next' : 'Reveal now'}</button>`}</div>
  </div>`;
}

export function qPhone(ctx, gs, pid, opts = {}) {
  const Q = gs.Q; if (!Q) return { k: 'wait' };
  const cur = Q.list[Q.i];
  if (ctx.solo) return { k: 'q', solo: true, phase: Q.phase, gain: Q.gain[pid] || 0, mine: Q.ans[pid] ? Q.ans[pid].i : -1, a: Q.phase === 'reveal' ? cur.a : -1, o: cur.o, score: gs.score[pid] || 0 };
  return { k: 'q', tf: !!opts.tf, phase: Q.phase, o: cur.o, q: cur.q, i: Q.i, n: Q.list.length, end: Q.end, mine: Q.ans[pid] ? Q.ans[pid].i : -1, gain: Q.gain[pid] || 0, a: Q.phase === 'reveal' ? cur.a : -1, score: gs.score[pid] || 0 };
}

export function qRenderPhone(d) {
  if (d.solo && d.phase !== 'reveal') return '';
  if (d.phase === 'reveal') {
    const ok = d.mine === d.a;
    return `<div class="result ${ok ? 'good' : 'badr'}"><h2>${ok ? 'Correct!' : d.mine < 0 ? 'Time up!' : 'Wrong!'}</h2>
      ${ok ? `<p class="big">+${d.gain}</p>` : `<p>Answer: <b>${esc(d.o[d.a])}</b></p>`}<p class="muted">Your score: ${d.score}</p></div>`;
  }
  if (d.mine >= 0) return `<div class="result"><h2>Locked in</h2><p>${d.tf ? '' : LET[d.mine] + ': '}${esc(d.o[d.mine])}</p><p class="muted">Wait for the others…</p></div>`;
  return `<div class="pq"><div class="qmeta"><span class="pill">${d.i + 1}/${d.n}</span>${timer(d.end)}</div><p class="pq-text">${esc(d.q)}</p>
    <div class="pads ${d.tf ? 'tf' : ''}">${d.o.map((o, i) => `<button class="pad o${i}" data-a='${A({ k: 'ans', i })}'><b>${d.tf ? '' : LET[i]}</b>${esc(o)}</button>`).join('')}</div></div>`;
}
