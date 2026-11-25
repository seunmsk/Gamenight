import { shuffle, esc, A, av, timer } from '../ui.js';

const VOTE_SECS = 20;

function begin(ctx, gs) {
  if (gs.phase !== 'upload') return;
  gs.order = shuffle(Object.keys(gs.photos));
  if (gs.order.length < 2) { gs.warn = 'Need at least 2 photos to start'; ctx.sync(); return; }
  gs.i = -1; next(ctx, gs);
}
function next(ctx, gs) {
  gs.i++;
  if (gs.i >= gs.order.length) return ctx.finish(gs.score, { title: 'Who knows everybody’s childhood', lines: ['Guess right: +100', 'Fool someone with your photo: +50 each'] });
  gs.phase = 'vote'; gs.votes = {}; gs.end = Date.now() + VOTE_SECS * 1000;
  ctx.after('v', VOTE_SECS * 1000 + 300, () => reveal(ctx, gs)); ctx.sync();
}
function reveal(ctx, gs) {
  if (gs.phase !== 'vote') return;
  ctx.cancel('v'); gs.phase = 'reveal';
  const owner = gs.order[gs.i]; gs.right = [];
  for (const v in gs.votes) { if (gs.votes[v] === owner) { gs.score[v] += 100; gs.right.push(v); } else gs.score[owner] += 50; }
  ctx.sfx('ok'); ctx.after('v', 7000, () => next(ctx, gs)); ctx.sync();
}

export default {
  id: 'pikin', name: 'Who Pikin Be This?', color: '#ff5cc8', glyph: 'P',
  blurb: 'Everyone uploads a childhood photo. Guess whose baby face is on the screen.',
  players: '3–16', min: 3, max: 16, solo: null,
  options: [],
  note: 'Photos stay on the host screen for this game only. Nothing is saved.',
  start(ctx) {
    const gs = { phase: 'upload', photos: {}, score: {} };
    ctx.humans().forEach(p => { gs.score[p.pid] = 0; });
    return gs;
  },
  act(ctx, gs, pid, a) {
    if (a.k === 'photo' && gs.phase === 'upload') {
      if (typeof a.d !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(a.d) || a.d.length > 600000) return false;
      gs.photos[pid] = a.d; gs.warn = '';
      if (ctx.humans().filter(p => ctx.online(p.pid)).every(p => gs.photos[p.pid])) { begin(ctx, gs); return false; }
      return true;
    }
    if (a.k === 'unphoto' && gs.phase === 'upload') { delete gs.photos[pid]; return true; }
    if (a.k === 'vote' && gs.phase === 'vote' && pid !== gs.order[gs.i] && gs.photos[a.pid]) {
      gs.votes[pid] = a.pid;
      const voters = ctx.humans().filter(p => p.pid !== gs.order[gs.i] && ctx.online(p.pid));
      if (voters.every(p => gs.votes[p.pid])) { reveal(ctx, gs); return false; }
      return true;
    }
    if (a.k === 'skip' && ctx.isCtl(pid)) {
      if (gs.phase === 'upload') begin(ctx, gs); else if (gs.phase === 'vote') reveal(ctx, gs); else { ctx.cancel('v'); next(ctx, gs); }
      return false;
    }
    return false;
  },
  tv(ctx, gs) {
    if (gs.phase === 'upload') {
      const up = ctx.humans().filter(p => gs.photos[p.pid]);
      return `<div class="center-stack"><h1 class="display">Upload a childhood photo</h1><p class="lead">Use your phone. Baby pictures, school pictures, the more embarrassing the better.</p>
        <div class="answered">${up.map(p => av(p, 'sm')).join('')}<span>${up.length}/${ctx.humans().length} uploaded</span></div>
        ${gs.warn ? `<p class="hot">${esc(gs.warn)}</p>` : ''}<button class="btn" data-a='${A({ k: 'skip' })}'>Start with ${up.length} photos</button></div>`;
    }
    const owner = ctx.p(gs.order[gs.i]), rev = gs.phase === 'reveal';
    const voted = Object.keys(gs.votes).length;
    return `<div class="pikin"><div class="photo-frame"><img src="${gs.photos[owner.pid]}" alt="Childhood photo"></div>
      <div class="pikin-side"><span class="pill">${gs.i + 1} of ${gs.order.length}</span>
      ${rev ? `<h1 class="display">Na ${esc(owner.name)}!</h1>${av(owner, 'xl')}<p class="lead">${gs.right.length ? `Guessed by ${gs.right.map(x => esc(ctx.name(x))).join(', ')}` : 'Nobody guessed right!'}</p>`
        : `<h1 class="display">Who pikin be this?</h1><p class="lead">Vote on your phone ${timer(gs.end)}</p><p class="muted">${voted} voted</p>`}
      <button class="btn ghost" data-a='${A({ k: 'skip' })}'>${rev ? 'Next' : 'Reveal'}</button></div></div>`;
  },
  phone(ctx, gs, pid) {
    if (gs.phase === 'upload') return { k: 'upload', done: !!gs.photos[pid] };
    const owner = gs.order[gs.i];
    return { k: gs.phase, mine: owner === pid, opts: ctx.humans().filter(p => gs.photos[p.pid] && p.pid !== pid).map(p => ({ pid: p.pid, name: p.name, col: p.col, look: p.look })), vote: gs.votes[pid] || null, owner: gs.phase === 'reveal' ? ctx.name(owner) : '', right: gs.phase === 'reveal' && gs.votes[pid] === owner, end: gs.end };
  },
  renderPhone(d) {
    if (d.k === 'upload') {
      if (d.done) return `<div class="result good"><h2>Photo sent!</h2><p>Wait for everyone else.</p><button class="btn ghost" data-a='${A({ k: 'unphoto' })}'>Change photo</button></div>`;
      return `<div class="center-stack"><h2>Upload a childhood photo of yourself</h2><label class="upload"><input type="file" accept="image/*" id="pkfile"><span>Choose photo</span></label><p class="muted small">It only shows on the big screen during this game.</p><p class="pkstatus muted"></p></div>`;
    }
    if (d.mine && d.k === 'vote') return `<div class="result"><h2>Na your photo be this!</h2><p>Don’t give yourself away.</p></div>`;
    if (d.k === 'vote') {
      if (d.vote) { const p = d.opts.find(x => x.pid === d.vote); return `<div class="result"><h2>Vote locked</h2><p>${av(p)} ${esc(p && p.name)}</p></div>`; }
      return `<div class="pq"><div class="qmeta"><span class="pill">Whose photo?</span>${timer(d.end)}</div><div class="votegrid">${d.opts.map(p => `<button class="vbtn" data-a='${A({ k: 'vote', pid: p.pid })}'>${av(p)}<span>${esc(p.name)}</span></button>`).join('')}</div></div>`;
    }
    return `<div class="result ${d.right ? 'good' : ''}"><h2>Na ${esc(d.owner)}!</h2><p>${d.mine ? 'Your photo!' : d.right ? 'You got it! +100' : 'You missed'}</p></div>`;
  },
  mountPhone(el, d, send) {
    const f = el.querySelector('#pkfile'); if (!f || f._bound) return; f._bound = true;
    f.addEventListener('change', () => {
      const file = f.files && f.files[0]; if (!file) return;
      const st = el.querySelector('.pkstatus'); if (st) st.textContent = 'Shrinking photo…';
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 420, sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        send({ k: 'photo', d: c.toDataURL('image/jpeg', 0.7) });
        if (st) st.textContent = 'Sending…';
      };
      img.onerror = () => { if (st) st.textContent = 'Could not read that photo. Try another.'; };
      img.src = url;
    });
  }
};
