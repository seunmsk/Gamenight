import { shuffle, esc, A, av, timer } from '../ui.js';

const WRITE_SECS = 120, VOTE_SECS = 25;

function startVoting(ctx, gs) {
  if (gs.phase !== 'write') return;
  ctx.cancel('w');
  gs.order = shuffle(Object.keys(gs.sub));
  if (!gs.order.length) return ctx.finish(gs.score, { title: 'Nobody wrote anything!' });
  gs.i = -1; nextLie(ctx, gs);
}
function nextLie(ctx, gs) {
  gs.i++;
  if (gs.i >= gs.order.length) return ctx.finish(gs.score, { title: 'Best liar & best detective', lines: ['Catch a lie: +100', 'Fool someone: +50 each'] });
  gs.phase = 'vote'; gs.votes = {}; gs.end = Date.now() + VOTE_SECS * 1000;
  ctx.after('v', VOTE_SECS * 1000 + 300, () => reveal(ctx, gs));
  ctx.sync();
}
function voters(ctx, gs) { const author = gs.order[gs.i]; return ctx.humans().filter(p => p.pid !== author && ctx.online(p.pid)); }
function reveal(ctx, gs) {
  if (gs.phase !== 'vote') return;
  ctx.cancel('v'); gs.phase = 'reveal';
  const author = gs.order[gs.i], s = gs.sub[author];
  gs.caught = []; gs.fooled = [];
  for (const v in gs.votes) {
    if (+gs.votes[v] === s.lie) { gs.score[v] += 100; gs.caught.push(v); }
    else { gs.score[author] += 50; gs.fooled.push(v); }
  }
  ctx.sfx('ok');
  ctx.after('v', 8000, () => nextLie(ctx, gs));
  ctx.sync();
}

export default {
  id: 'nalie', name: 'Na Lie!', color: '#f5b301', glyph: '!',
  blurb: 'Two truths and one lie. Fool the room, or catch the liar.',
  players: '3–16', min: 3, max: 16, solo: null,
  options: [],
  start(ctx) {
    const gs = { phase: 'write', sub: {}, score: {}, end: Date.now() + WRITE_SECS * 1000 };
    ctx.humans().forEach(p => { gs.score[p.pid] = 0; });
    ctx.after('w', WRITE_SECS * 1000 + 300, () => startVoting(ctx, gs));
    return gs;
  },
  act(ctx, gs, pid, a) {
    if (a.k === 'write' && gs.phase === 'write') {
      const st = [a.s0, a.s1, a.s2].map(x => String(x || '').trim().slice(0, 120));
      const lie = +a.lie;
      if (st.some(x => !x) || !(lie >= 0 && lie <= 2)) return false;
      gs.sub[pid] = { st, lie };
      if (ctx.humans().filter(p => ctx.online(p.pid)).every(p => gs.sub[p.pid])) { startVoting(ctx, gs); return false; }
      return true;
    }
    if (a.k === 'vote' && gs.phase === 'vote' && pid !== gs.order[gs.i] && [0, 1, 2].includes(+a.i)) {
      gs.votes[pid] = +a.i;
      if (voters(ctx, gs).every(p => gs.votes[p.pid] != null)) { reveal(ctx, gs); return false; }
      return true;
    }
    if (a.k === 'skip' && ctx.isCtl(pid)) {
      if (gs.phase === 'write') startVoting(ctx, gs);
      else if (gs.phase === 'vote') reveal(ctx, gs);
      else { ctx.cancel('v'); nextLie(ctx, gs); }
      return false;
    }
    return false;
  },
  tv(ctx, gs) {
    if (gs.phase === 'write') {
      const done = ctx.humans().filter(p => gs.sub[p.pid]);
      return `<div class="center-stack"><h1 class="display">Write 2 truths and 1 lie</h1><p class="lead">On your phone. Make the lie believable. ${timer(gs.end)}</p>
        <div class="answered">${done.map(p => av(p, 'sm')).join('')}<span>${done.length}/${ctx.humans().length} ready</span></div>
        <button class="btn ghost" data-a='${A({ k: 'skip' })}'>Start voting</button></div>`;
    }
    const author = ctx.p(gs.order[gs.i]), s = gs.sub[author.pid], rev = gs.phase === 'reveal';
    const count = i => Object.values(gs.votes).filter(v => +v === i).length;
    return `<div class="center-stack"><span class="pill">${gs.i + 1} of ${gs.order.length}</span>
      <h1 class="display">${av(author)} ${esc(author.name)}</h1><p class="lead">${rev ? 'The lie was…' : `Which one is the lie? ${timer(gs.end)}`}</p>
      <div class="stmts">${s.st.map((t, i) => `<div class="stmt ${rev ? (i === s.lie ? 'lie' : 'truth') : ''}"><b>${i + 1}</b><span>${esc(t)}</span>${rev ? `<em>${count(i)} vote${count(i) === 1 ? '' : 's'}</em>` : ''}</div>`).join('')}</div>
      ${rev ? `<p class="lead">${gs.caught.length ? `Caught by ${gs.caught.map(x => esc(ctx.name(x))).join(', ')}` : 'Nobody caught it!'}${gs.fooled.length ? ` · Fooled ${gs.fooled.length}` : ''}</p>` : ''}
      <button class="btn ghost" data-a='${A({ k: 'skip' })}'>${rev ? 'Next' : 'Reveal'}</button></div>`;
  },
  phone(ctx, gs, pid) {
    if (gs.phase === 'write') return { k: 'write', end: gs.end, done: !!gs.sub[pid] };
    const author = gs.order[gs.i], s = gs.sub[author];
    return { k: gs.phase, mineTurn: author === pid, author: ctx.name(author), st: s.st, end: gs.end, mine: gs.votes[pid], lie: gs.phase === 'reveal' ? s.lie : -1, score: gs.score[pid] };
  },
  renderPhone(d) {
    if (d.k === 'write') {
      if (d.done) return '<div class="result good"><h2>Sent!</h2><p>Keep a straight face when it comes up.</p></div>';
      return `<form class="form" data-form="write"><div class="qmeta"><span class="pill">2 truths, 1 lie</span>${timer(d.end)}</div>
        ${[0, 1, 2].map(i => `<label class="stmt-in"><input type="radio" name="lie" value="${i}" ${i === 2 ? 'checked' : ''}><span>Lie?</span><input id="nl${i}" name="s${i}" type="text" maxlength="120" required placeholder="Statement ${i + 1}"></label>`).join('')}
        <p class="muted small">Tick the one that is the lie.</p><button class="btn" type="submit">Send</button></form>`;
    }
    if (d.mineTurn) return `<div class="result"><h2>It’s your turn</h2><p>Keep a straight face. Don’t laugh!</p></div>`;
    if (d.k === 'vote') {
      if (d.mine != null) return `<div class="result"><h2>Vote locked</h2><p>You picked #${+d.mine + 1}</p></div>`;
      return `<div class="pq"><div class="qmeta"><span class="pill">Which is ${esc(d.author)}’s lie?</span>${timer(d.end)}</div>
        <div class="pads one">${d.st.map((t, i) => `<button class="pad o${i}" data-a='${A({ k: 'vote', i })}'><b>${i + 1}</b>${esc(t)}</button>`).join('')}</div></div>`;
    }
    const ok = d.mine === d.lie;
    return `<div class="result ${ok ? 'good' : 'badr'}"><h2>${ok ? 'You caught am!' : d.mine == null ? 'You didn’t vote' : 'You fell for it'}</h2><p>The lie: ${esc(d.st[d.lie])}</p></div>`;
  }
};
