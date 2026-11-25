import { sample, shuffle, esc, A, av, timer } from '../ui.js';
import { JOLLOF_TRIVIA, POT_OR_NOT, INGREDIENTS_GOOD, INGREDIENTS_BAD } from '../content.js';
import { prepQs, qBegin, qAnswer, qSkip, qTV, qPhone, qRenderPhone } from './quiz.js';

const TEAMS = { NG: { name: 'Team Naija', col: '#2fd06b' }, GH: { name: 'Team Ghana', col: '#f5b301' } };
const RUSH_SECS = 20;

function teamScore(ctx, gs, t) {
  const m = ctx.humans().filter(p => gs.team[p.pid] === t);
  if (!m.length) return t === 'GH' && gs.cpu != null ? gs.cpu : 0;
  return Math.round(m.reduce((s, p) => s + (gs.score[p.pid] || 0), 0) / m.length);
}

function cpuHook(ctx, gs) { if (gs.cpu != null && Math.random() < 0.62) gs.cpu += 500 + Math.round(Math.random() * 380); }

function intro(ctx, gs, title, sub, next) {
  gs.phase = 'intro'; gs.introT = title; gs.introS = sub; gs.next = next;
  ctx.after('intro', 4500, () => next()); ctx.sync();
}

function round1(ctx, gs) {
  intro(ctx, gs, 'Round 1: Jollof Trivia', '5 questions. Fast and correct wins.', () => {
    gs.phase = 'quiz'; gs.label = 'Trivia';
    qBegin(ctx, gs, prepQs(sample(JOLLOF_TRIVIA, 5)), 15, () => round2(ctx, gs), cpuHook);
  });
}
function round2(ctx, gs) {
  intro(ctx, gs, 'Round 2: Ingredient Rush', 'Tap ONLY what goes in the pot. Wrong ones cost you.', () => {
    gs.phase = 'rush'; gs.rushEnd = Date.now() + RUSH_SECS * 1000; gs.rush = {};
    ctx.humans().forEach(p => {
      gs.rush[p.pid] = { tiles: shuffle([...sample(INGREDIENTS_GOOD, 6).map(t => ({ t, g: 1 })), ...sample(INGREDIENTS_BAD, 6).map(t => ({ t, g: 0 }))]), picked: {}, found: 0, pts: 0, done: false };
    });
    ctx.after('rush', RUSH_SECS * 1000 + 300, () => endRush(ctx, gs));
    ctx.sync();
  });
}
function endRush(ctx, gs) {
  if (gs.phase !== 'rush') return;
  ctx.cancel('rush');
  for (const pid in gs.rush) gs.score[pid] = (gs.score[pid] || 0) + gs.rush[pid].pts;
  if (gs.cpu != null) gs.cpu += 300 + Math.round(Math.random() * 450);
  round3(ctx, gs);
}
function round3(ctx, gs) {
  intro(ctx, gs, 'Round 3: Pot or Not', 'True or false. 6 quick ones.', () => {
    gs.phase = 'quiz'; gs.label = 'Pot or Not';
    const tf = sample(POT_OR_NOT, 6).map(x => ({ q: x.q, o: ['Pot (true)', 'Not (false)'], a: x.a ? 0 : 1 }));
    qBegin(ctx, gs, tf, 10, () => final(ctx, gs), cpuHook);
  });
}
function final(ctx, gs) {
  const ng = teamScore(ctx, gs, 'NG'), gh = teamScore(ctx, gs, 'GH');
  const win = ng === gh ? 'Draw! Both pots are sweet.' : ng > gh ? 'Naija jollof carries the day!' : 'Ghana jollof takes it this time!';
  const scores = {};
  ctx.humans().forEach(p => { scores[p.pid] = teamScore(ctx, gs, gs.team[p.pid]); });
  ctx.finish(scores, { title: win, lines: [`Team Naija: <b>${ng}</b>`, `Team Ghana${gs.cpu != null ? ' (CPU)' : ''}: <b>${gh}</b>`] });
}

export default {
  id: 'jollof', name: 'Jollof Wars', color: '#ff8a3d', glyph: 'J',
  blurb: 'Team Naija vs Team Ghana. Trivia, Ingredient Rush, then Pot or Not.',
  players: '1–16', min: 1, max: 16, solo: 'full',
  options: [{ key: 'teams', label: 'Teams', choices: [['pick', 'Players pick a side'], ['auto', 'Split randomly']], def: 'pick' }],
  start(ctx, o) {
    const gs = { team: {}, score: {}, right: {}, cpu: null };
    const hs = ctx.humans();
    hs.forEach(p => { gs.score[p.pid] = 0; });
    if (hs.length < 2) { hs.forEach(p => { gs.team[p.pid] = 'NG'; }); gs.cpu = 0; round1(ctx, gs); return gs; }
    if (o.teams === 'auto') { shuffle(hs).forEach((p, i) => { gs.team[p.pid] = i % 2 ? 'GH' : 'NG'; }); round1(ctx, gs); return gs; }
    gs.phase = 'pick'; gs.pickEnd = Date.now() + 15000;
    ctx.after('pick', 15300, () => this.lockTeams(ctx, gs));
    return gs;
  },
  lockTeams(ctx, gs) {
    if (gs.phase !== 'pick') return;
    ctx.cancel('pick');
    const hs = ctx.humans();
    for (const p of shuffle(hs)) if (!gs.team[p.pid]) {
      const n = hs.filter(x => gs.team[x.pid] === 'NG').length, g = hs.filter(x => gs.team[x.pid] === 'GH').length;
      gs.team[p.pid] = n <= g ? 'NG' : 'GH';
    }
    for (const t of ['NG', 'GH']) {
      const o = t === 'NG' ? 'GH' : 'NG';
      if (!hs.some(p => gs.team[p.pid] === t)) { const mv = shuffle(hs.filter(p => gs.team[p.pid] === o))[0]; if (mv) gs.team[mv.pid] = t; }
    }
    round1(ctx, gs);
  },
  act(ctx, gs, pid, a) {
    if (a.k === 'team' && gs.phase === 'pick' && TEAMS[a.t]) {
      gs.team[pid] = a.t;
      if (ctx.humans().every(p => gs.team[p.pid])) this.lockTeams(ctx, gs);
      return true;
    }
    if (a.k === 'go' && gs.phase === 'pick' && ctx.isCtl(pid)) { this.lockTeams(ctx, gs); return false; }
    if (a.k === 'skip' && ctx.isCtl(pid)) {
      if (gs.phase === 'intro') { ctx.cancel('intro'); gs.next(); return false; }
      if (gs.phase === 'rush') { endRush(ctx, gs); return false; }
      if (gs.phase === 'quiz') return qSkip(ctx, gs);
    }
    if (a.k === 'ans' && gs.phase === 'quiz') return qAnswer(ctx, gs, pid, +a.i);
    if (a.k === 'tile' && gs.phase === 'rush') {
      const r = gs.rush[pid]; const i = +a.i; if (!r || r.done || r.picked[i] || !r.tiles[i]) return false;
      r.picked[i] = 1;
      if (r.tiles[i].g) { r.found++; r.pts += 100; ctx.sfx('ok'); } else { r.pts -= 100; }
      if (r.found === 6) { r.done = true; r.pts += Math.round(Math.max(0, gs.rushEnd - Date.now()) / 50); }
      if (ctx.humans().every(p => gs.rush[p.pid].done)) { endRush(ctx, gs); return false; }
      return true;
    }
    return false;
  },
  tv(ctx, gs) {
    const ng = teamScore(ctx, gs, 'NG'), gh = teamScore(ctx, gs, 'GH');
    const bar = `<div class="teambar"><div style="--c:${TEAMS.NG.col}"><b>Team Naija</b><span>${ng}</span></div><div class="vs">vs</div><div style="--c:${TEAMS.GH.col}"><b>Team Ghana${gs.cpu != null ? ' (CPU)' : ''}</b><span>${gh}</span></div></div>`;
    if (gs.phase === 'pick') {
      const col = t => ctx.humans().filter(p => gs.team[p.pid] === t).map(p => `<div class="chip">${av(p, 'sm')} ${esc(p.name)}</div>`).join('') || '<p class="muted">Nobody yet</p>';
      return `<div class="center-stack"><h1 class="display">Pick your side</h1><p class="lead">Choose on your phone. ${timer(gs.pickEnd)}</p>
        <div class="teams2"><div class="teamcol" style="--c:${TEAMS.NG.col}"><h2>Team Naija</h2>${col('NG')}</div><div class="teamcol" style="--c:${TEAMS.GH.col}"><h2>Team Ghana</h2>${col('GH')}</div></div>
        <button class="btn" data-a='${A({ k: 'go' })}'>Lock teams</button></div>`;
    }
    if (gs.phase === 'intro') return `${bar}<div class="center-stack intro"><h1 class="display">${esc(gs.introT)}</h1><p class="lead">${esc(gs.introS)}</p><button class="btn ghost" data-a='${A({ k: 'skip' })}'>Start now</button></div>`;
    if (gs.phase === 'rush') {
      const rows = ctx.humans().map(p => { const r = gs.rush[p.pid]; return `<div class="rushrow" style="--c:${TEAMS[gs.team[p.pid]].col}">${av(p, 'sm')}<span>${esc(p.name)}</span><div class="meter"><i style="width:${r.found / 6 * 100}%"></i></div><b>${r.found}/6</b></div>`; }).join('');
      return `${bar}<div class="center-stack"><h1 class="display">Ingredient Rush ${timer(gs.rushEnd, 'big')}</h1><p class="lead">Find the 6 jollof ingredients on your phone</p><div class="rushrows">${rows}</div><button class="btn ghost" data-a='${A({ k: 'skip' })}'>End round</button></div>`;
    }
    if (gs.phase === 'quiz') return bar + qTV(ctx, gs, { label: gs.label, tf: gs.label === 'Pot or Not' });
    return bar;
  },
  phone(ctx, gs, pid) {
    const t = gs.team[pid];
    const base = { team: t ? TEAMS[t].name : '', tcol: t ? TEAMS[t].col : '' };
    if (gs.phase === 'pick') return { ...base, k: 'pick', end: gs.pickEnd };
    if (gs.phase === 'intro') return { ...base, k: 'intro', t: gs.introT, s: gs.introS };
    if (gs.phase === 'rush') { const r = gs.rush[pid]; return { ...base, k: 'rush', end: gs.rushEnd, tiles: r.tiles.map((x, i) => ({ t: x.t, s: r.picked[i] ? (x.g ? 'g' : 'b') : '' })), found: r.found, pts: r.pts, done: r.done }; }
    if (gs.phase === 'quiz') return { ...base, ...qPhone(ctx, gs, pid, { tf: gs.label === 'Pot or Not' }) };
    return { ...base, k: 'wait' };
  },
  renderPhone(d) {
    const tag = d.team ? `<div class="teamtag" style="--c:${d.tcol}">${esc(d.team)}</div>` : '';
    if (d.k === 'pick') return `<div class="center-stack"><h2>Pick your side ${timer(d.end)}</h2>
      <button class="bigchoice" style="--c:${TEAMS.NG.col}" data-a='${A({ k: 'team', t: 'NG' })}'>Team Naija${d.team === 'Team Naija' ? ' ✓' : ''}</button>
      <button class="bigchoice" style="--c:${TEAMS.GH.col}" data-a='${A({ k: 'team', t: 'GH' })}'>Team Ghana${d.team === 'Team Ghana' ? ' ✓' : ''}</button></div>`;
    if (d.k === 'intro') return `${tag}<div class="result"><h2>${esc(d.t)}</h2><p>${esc(d.s)}</p></div>`;
    if (d.k === 'rush') {
      if (d.done) return `${tag}<div class="result good"><h2>Pot complete!</h2><p class="big">${d.pts}</p><p class="muted">Wait for the others</p></div>`;
      return `${tag}<div class="qmeta"><span class="pill">${d.found}/6 found · ${d.pts} pts</span>${timer(d.end)}</div>
        <div class="tiles">${d.tiles.map((t, i) => `<button class="tile ${t.s}" ${t.s ? 'disabled' : ''} data-a='${A({ k: 'tile', i })}'>${esc(t.t)}</button>`).join('')}</div>`;
    }
    if (d.k === 'q') { const q = qRenderPhone(d); return q ? tag + q : ''; }
    return `${tag}<div class="result"><h2>Hold on…</h2></div>`;
  }
};
