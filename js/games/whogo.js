import { sample, esc, A, av, timer } from '../ui.js';
import { WHO_GO } from '../content.js';

const VOTE_SECS = 20;

function nextQ(ctx, gs) {
  gs.i++;
  if (gs.i >= gs.qs.length) {
    if (ctx.solo) return ctx.finish({ me: gs.qs.length }, { title: 'Na una sabi who be who', unit: 'questions' });
    const most = {}; gs.hist.forEach(h => h.top.forEach(pid => { most[pid] = (most[pid] || 0) + 1; }));
    const lines = Object.entries(most).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([pid, n]) => `${esc(ctx.name(pid))} was picked most ${n}×`);
    return ctx.finish(gs.sync, { title: 'Who reads the room best', lines: [...lines, 'Points: 1 for each time you voted with the crowd'] });
  }
  gs.phase = 'vote'; gs.votes = {}; gs.end = Date.now() + VOTE_SECS * 1000;
  if (!ctx.solo) ctx.after('v', VOTE_SECS * 1000 + 300, () => reveal(ctx, gs));
  ctx.sync();
}
function reveal(ctx, gs) {
  if (gs.phase !== 'vote') return;
  ctx.cancel('v'); gs.phase = 'reveal';
  const tally = {}; Object.values(gs.votes).forEach(v => { tally[v] = (tally[v] || 0) + 1; });
  const max = Math.max(0, ...Object.values(tally));
  const top = Object.keys(tally).filter(k => tally[k] === max && max > 0);
  for (const voter in gs.votes) if (top.includes(gs.votes[voter])) gs.sync[voter] = (gs.sync[voter] || 0) + 1;
  gs.tally = tally; gs.top = top; gs.hist.push({ q: gs.qs[gs.i], top });
  ctx.sfx('ok');
  ctx.after('v', 7000, () => nextQ(ctx, gs));
  ctx.sync();
}

export default {
  id: 'whogo', name: 'Who Go Do Am?', color: '#b45cff', glyph: 'WG',
  blurb: '"Who go japa first?" Everyone votes on their phone. Results on the big screen.',
  players: '3–16, or one phone', min: 3, max: 16, solo: 'onephone',
  options: [{ key: 'count', label: 'Questions', choices: [[8, '8'], [12, '12'], [16, '16']], def: 8 }],
  start(ctx, o) {
    const gs = { qs: sample(WHO_GO, +o.count || 8), i: -1, sync: {}, hist: [] };
    ctx.humans().forEach(p => { gs.sync[p.pid] = 0; });
    nextQ(ctx, gs);
    return gs;
  },
  act(ctx, gs, pid, a) {
    if (ctx.solo) {
      if (a.k === 'point') { gs.phase = 'count'; gs.end = Date.now() + 3200; ctx.after('v', 3200, () => { gs.phase = 'pointed'; ctx.sfx('ok'); ctx.sync(); }); return true; }
      if (a.k === 'next') { ctx.cancel('v'); nextQ(ctx, gs); return false; }
      return false;
    }
    if (a.k === 'vote' && gs.phase === 'vote' && ctx.p(a.pid)) {
      gs.votes[pid] = a.pid;
      if (ctx.humans().filter(p => ctx.online(p.pid)).every(p => gs.votes[p.pid])) { reveal(ctx, gs); return false; }
      return true;
    }
    if (a.k === 'skip' && ctx.isCtl(pid)) { if (gs.phase === 'vote') reveal(ctx, gs); else { ctx.cancel('v'); nextQ(ctx, gs); } return false; }
    return false;
  },
  tv(ctx, gs) {
    const q = gs.qs[gs.i];
    const meta = `<span class="pill">${gs.i + 1} of ${gs.qs.length}</span>`;
    if (ctx.solo) {
      const body = gs.phase === 'count' ? `<div class="bigtimer">${timer(gs.end, 'huge')}</div><p class="lead">Get ready to point…</p>`
        : gs.phase === 'pointed' ? `<h1 class="display hot">POINT!</h1><p class="lead">Whoever gets the most fingers, explain yourself.</p><button class="btn" data-a='${A({ k: 'next' })}'>Next question</button>`
          : `<button class="btn huge" data-a='${A({ k: 'point' })}'>3, 2, 1… point</button>`;
      return `<div class="center-stack">${meta}<h1 class="display">${esc(q)}</h1>${body}</div>`;
    }
    if (gs.phase === 'vote') {
      const voted = ctx.humans().filter(p => gs.votes[p.pid]);
      return `<div class="center-stack">${meta}<h1 class="display">${esc(q)}</h1><p class="lead">Vote on your phone ${timer(gs.end)}</p>
        <div class="answered">${voted.map(p => av(p, 'sm')).join('')}<span>${voted.length}/${ctx.humans().length} voted</span></div>
        <button class="btn ghost" data-a='${A({ k: 'skip' })}'>Reveal now</button></div>`;
    }
    const max = Math.max(1, ...Object.values(gs.tally));
    const rows = ctx.humans().filter(p => gs.tally[p.pid]).sort((a, b) => gs.tally[b.pid] - gs.tally[a.pid]).map(p =>
      `<div class="vrow ${gs.top.includes(p.pid) ? 'top' : ''}">${av(p)}<span>${esc(p.name)}</span><div class="meter"><i style="width:${gs.tally[p.pid] / max * 100}%"></i></div><b>${gs.tally[p.pid]}</b></div>`).join('');
    const names = gs.top.map(pid => esc(ctx.name(pid))).join(' & ');
    return `<div class="center-stack">${meta}<p class="lead">${esc(q)}</p><h1 class="display hot">${names || 'Nobody voted!'}</h1><div class="vrows">${rows}</div>
      <button class="btn ghost" data-a='${A({ k: 'skip' })}'>Next</button></div>`;
  },
  phone(ctx, gs, pid) {
    if (ctx.solo) return { k: 'solo' };
    return { k: gs.phase, q: gs.qs[gs.i], end: gs.end, mine: gs.votes[pid] || null, opts: ctx.humans().map(p => ({ pid: p.pid, name: p.name, col: p.col })), top: gs.top || [], withCrowd: gs.phase === 'reveal' && (gs.top || []).includes(gs.votes[pid]), names: (gs.top || []).map(x => ctx.name(x)) };
  },
  renderPhone(d) {
    if (d.k === 'solo') return '';
    if (d.k === 'vote') {
      if (d.mine) { const p = d.opts.find(x => x.pid === d.mine); return `<div class="result"><h2>Vote locked</h2><p>${av(p)} ${esc(p && p.name)}</p></div>`; }
      return `<div class="pq"><div class="qmeta"><span class="pill">Vote</span>${timer(d.end)}</div><p class="pq-text">${esc(d.q)}</p>
        <div class="votegrid">${d.opts.map(p => `<button class="vbtn" data-a='${A({ k: 'vote', pid: p.pid })}'>${av(p)}<span>${esc(p.name)}</span></button>`).join('')}</div></div>`;
    }
    return `<div class="result ${d.withCrowd ? 'good' : ''}"><h2>${esc(d.names.join(' & ') || 'No votes')}</h2><p>${d.withCrowd ? 'You read the room. +1' : d.mine ? 'The crowd no agree with you' : 'You no vote'}</p></div>`;
  }
};
