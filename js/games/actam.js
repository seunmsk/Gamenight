import { shuffle, esc, A, av, timer } from '../ui.js';
import { ACT_AM } from '../content.js';
import { character } from '../characters.js';

const TEAMCOL = ['#ff4f6d', '#4f8cff', '#2fd06b', '#f5b301'];
const TEAMNAME = ['Team Suya', 'Team Puff-Puff', 'Team Zobo', 'Team Chin-Chin'];

function nextWord(gs) { if (!gs.pool.length) gs.pool = shuffle(gs.all); return gs.pool.pop(); }

function setupTurn(ctx, gs) {
  if (gs.turn >= gs.total) return finish(ctx, gs);
  const team = gs.teams[gs.turn % gs.teams.length];
  gs.actor = team.members[team.idx % team.members.length]; team.idx++;
  gs.phase = 'ready'; gs.got = []; gs.passed = []; gs.word = null;
  ctx.sync();
}
function finish(ctx, gs) {
  const scores = {};
  gs.teams.forEach(t => t.members.forEach(pid => { if (pid !== 'me' || ctx.solo) scores[pid] = Math.max(scores[pid] || 0, t.score); }));
  const best = Math.max(...gs.teams.map(t => t.score));
  const winners = gs.teams.filter(t => t.score === best);
  const title = winners.length > 1 ? 'It’s a tie!' : `${winners[0].name} wins!`;
  ctx.finish(ctx.solo ? { me: best } : scores, { title, lines: gs.teams.map(t => `${esc(t.name)}: <b>${t.score}</b>`), unit: 'words' });
}
function endTurn(ctx, gs) {
  if (gs.phase !== 'play') return;
  ctx.cancel('turn'); gs.phase = 'sum'; ctx.sfx('bad'); ctx.sync();
}

export default {
  id: 'actam', name: 'Act Am', color: '#ff4f6d', glyph: 'A',
  blurb: 'Charades, Naija style. Your phone shows the word, your team shouts.',
  players: '2–16, or one phone', min: 2, max: 16, solo: 'onephone',
  options: [
    { key: 'secs', label: 'Time per turn', choices: [[45, '45s'], [60, '60s'], [90, '90s']], def: 60 },
    { key: 'rounds', label: 'Turns per team', choices: [[2, '2'], [3, '3'], [4, '4']], def: 2 },
    { key: 'teams', label: 'Number of teams', choices: [[2, '2'], [3, '3'], [4, '4']], def: 2 },
    { key: 'cat', label: 'Words', choices: [['all', 'Everything'], ...Object.keys(ACT_AM).map(k => [k, k])], def: 'all' }
  ],
  start(ctx, o) {
    const nT = ctx.solo ? +o.teams || 2 : Math.min(+o.teams || 2, ctx.humans().length);
    const teams = Array.from({ length: nT }, (_, i) => ({ name: TEAMNAME[i], col: TEAMCOL[i], members: [], score: 0, idx: 0 }));
    if (ctx.solo) teams.forEach(t => t.members.push('me'));
    else shuffle(ctx.humans()).forEach((p, i) => teams[i % nT].members.push(p.pid));
    const all = o.cat && ACT_AM[o.cat] ? ACT_AM[o.cat] : Object.values(ACT_AM).flat();
    const gs = { teams, all, pool: shuffle(all), turn: 0, total: nT * (+o.rounds || 2), secs: +o.secs || 60, maxPass: 3 };
    setupTurn(ctx, gs);
    return gs;
  },
  act(ctx, gs, pid, a) {
    const isActor = pid === gs.actor || ctx.solo;
    if (a.k === 'begin' && gs.phase === 'ready' && (isActor || ctx.isCtl(pid))) {
      gs.phase = 'play'; gs.end = Date.now() + gs.secs * 1000; gs.word = nextWord(gs);
      ctx.after('turn', gs.secs * 1000 + 300, () => endTurn(ctx, gs)); ctx.sfx('start'); return true;
    }
    if (gs.phase === 'play' && isActor) {
      if (a.k === 'got') { gs.got.push(gs.word); gs.teams[gs.turn % gs.teams.length].score++; gs.word = nextWord(gs); ctx.sfx('ok'); return true; }
      if (a.k === 'pass' && gs.passed.length < gs.maxPass) { gs.passed.push(gs.word); gs.word = nextWord(gs); return true; }
    }
    if (a.k === 'stop' && gs.phase === 'play' && (isActor || ctx.isCtl(pid))) { endTurn(ctx, gs); return false; }
    if (a.k === 'next' && gs.phase === 'sum' && (isActor || ctx.isCtl(pid))) { gs.turn++; setupTurn(ctx, gs); return false; }
    return false;
  },
  tv(ctx, gs) {
    const team = gs.teams[gs.turn % gs.teams.length];
    const actor = ctx.solo ? null : ctx.p(gs.actor);
    const board = `<div class="teamscores">${gs.teams.map((t, i) => `<div class="ts ${t === team ? 'on' : ''}" style="--c:${t.col}"><b>${esc(t.name)}</b><span>${t.score}</span>${ctx.solo ? '' : `<i>${t.members.map(pid => av(ctx.p(pid), 'sm')).join('')}</i>`}</div>`).join('')}</div>`;
    const round = `<span class="pill">Turn ${Math.min(gs.turn + 1, gs.total)} of ${gs.total}</span>`;
    if (gs.phase === 'ready') return `${board}<div class="center-stack">${round}<h1 class="display" style="color:${team.col}">${esc(team.name)}</h1>
      ${actor ? `<div class="stage-chr">${character(actor.look, actor.col, { pose: 'wave', seed: actor.pid })}</div>` : ''}<p class="lead">${actor ? `<b>${esc(actor.name)}</b> is acting. Check your phone to start.` : 'Pass the phone to whoever is acting.'}</p>
      ${ctx.solo ? '' : `<button class="btn ghost" data-a='${A({ k: 'begin' })}'>Start turn</button>`}</div>`;
    if (gs.phase === 'play' && ctx.solo) return board;
    if (gs.phase === 'play') return `${board}<div class="center-stack">${round}<div class="bigtimer">${timer(gs.end, 'huge')}</div>
      <p class="lead">${actor ? `<b>${esc(actor.name)}</b> is acting for` : 'Acting for'} <b style="color:${team.col}">${esc(team.name)}</b></p>
      <p class="tally">${gs.got.length} got · ${gs.passed.length} passed</p><button class="btn ghost" data-a='${A({ k: 'stop' })}'>End turn</button></div>`;
    return `${board}<div class="center-stack">${round}<h1 class="display">Time up! +${gs.got.length}</h1>
      <div class="wordlist">${gs.got.map(w => `<span class="w good">${esc(w)}</span>`).join('')}${gs.passed.map(w => `<span class="w badw">${esc(w)}</span>`).join('')}</div>
      ${ctx.solo ? '' : `<button class="btn" data-a='${A({ k: 'next' })}'>${gs.turn + 1 >= gs.total ? 'See results' : 'Next team'}</button>`}</div>`;
  },
  phone(ctx, gs, pid) {
    const team = gs.teams[gs.turn % gs.teams.length];
    const mine = gs.teams.find(t => t.members.includes(pid));
    const role = ctx.solo || pid === gs.actor ? 'actor' : mine === team ? 'mate' : 'opp';
    const d = { k: gs.phase, role, team: team.name, tcol: team.col, actor: ctx.name(gs.actor), my: mine ? mine.name : '', mycol: mine ? mine.col : '', solo: ctx.solo };
    if (role === 'actor' && gs.phase === 'play') Object.assign(d, { word: gs.word, end: gs.end, got: gs.got.length, passLeft: gs.maxPass - gs.passed.length });
    if (gs.phase === 'play') d.end = gs.end;
    if (gs.phase === 'sum') Object.assign(d, { got: gs.got.length, last: gs.turn + 1 >= gs.total });
    return d;
  },
  renderPhone(d) {
    const tag = d.my && !d.solo ? `<div class="teamtag" style="--c:${d.mycol}">${esc(d.my)}</div>` : '';
    if (d.k === 'ready') {
      if (d.role === 'actor') return `${tag}<div class="center-stack"><h2>${d.solo ? `${esc(d.team)}, your actor takes the phone` : 'You’re acting!'}</h2><p class="muted">Don’t show anyone the screen. Act it out, no talking.</p><button class="btn huge" data-a='${A({ k: 'begin' })}'>Show my word</button></div>`;
      return `${tag}<div class="result"><h2>${esc(d.actor)} is about to act</h2><p>${d.role === 'mate' ? 'Your team is up. Get ready to shout!' : 'Not your team. Watch them!'}</p></div>`;
    }
    if (d.k === 'play') {
      if (d.role === 'actor') return `<div class="actor"><div class="qmeta"><span class="pill">${d.got} got</span>${timer(d.end)}</div>
        <div class="word">${esc(d.word)}</div>
        <div class="row2"><button class="btn pass" ${d.passLeft ? '' : 'disabled'} data-a='${A({ k: 'pass' })}'>Pass (${d.passLeft})</button><button class="btn got" data-a='${A({ k: 'got' })}'>Got am!</button></div></div>`;
      return `${tag}<div class="result ${d.role === 'mate' ? 'good' : ''}"><h2>${d.role === 'mate' ? 'Guess out loud!' : 'No helping o!'}</h2><p>${esc(d.actor)} is acting for ${esc(d.team)}</p>${timer(d.end, 'big')}</div>`;
    }
    return `${tag}<div class="result"><h2>Time up!</h2><p class="big">+${d.got}</p>${d.role === 'actor' ? `<button class="btn" data-a='${A({ k: 'next' })}'>${d.last ? 'See results' : d.solo ? 'Next team' : 'Done'}</button>` : ''}</div>`;
  }
};
