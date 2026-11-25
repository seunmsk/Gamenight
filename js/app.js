import { esc, A, av, COLORS, patch, delegate, toast, unlockAudio, setClockOffset, sfx, isMuted, setMuted } from './ui.js';
import { hostRoom, joinRoom, makeCode, useLocal } from './net.js';
import { Engine } from './engine.js';
import { GAMES, ORDER } from './games/index.js';

const $ = s => document.querySelector(s);
const app = $('#app');
const store = {
  get(k, d) { try { const v = localStorage.getItem('gamenight-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('gamenight-' + k, JSON.stringify(v)); } catch (e) { } }
};
const params = new URLSearchParams(location.search);
const joinURL = code => `${location.origin}${location.pathname}?join=${code}${useLocal ? '&net=local' : ''}`;

let wake = null;
async function keepAwake() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && app.dataset.mode && app.dataset.mode !== 'home') keepAwake(); });

const logo = (cls = '') => `<span class="logo ${cls}" aria-label="Game Night Naija"><span class="logo-mark"><i></i><i></i><i></i></span><span class="lw"><span class="lname">Game Night</span><span class="ng">NAIJA</span></span></span>`;
const muteBtn = () => `<button class="iconbtn" data-ui="mute" aria-label="Sound">${isMuted() ? 'Sound off' : 'Sound on'}</button>`;
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ui="mute"]'); if (!b) return;
  setMuted(!isMuted()); b.textContent = isMuted() ? 'Sound off' : 'Sound on';
});

// ================= HOME =================
function home() {
  app.dataset.mode = 'home'; document.body.className = 'home';
  const saved = store.get('host', null);
  const canResume = saved && saved.code && Date.now() - saved.t < 12 * 3600e3 && (saved.players || []).length;
  app.innerHTML = `<div class="hero">
    <div class="hero-top">${logo('big')}<p class="tag">Na we dey play. One big screen, everybody on their phone.</p></div>
    <div class="hero-cards">
      <button class="hcard h1" data-go="host"><b>Host a games night</b><span>Open this on a laptop or TV. Everyone joins with a code.</span></button>
      <button class="hcard h2" data-go="join"><b>Join a room</b><span>On your phone. Enter the code on the big screen.</span></button>
      <button class="hcard h3" data-go="solo"><b>Play solo</b><span>Trivia, Whot, Ludo and Ayo against the CPU.</span></button>
    </div>
    ${canResume ? `<button class="btn ghost" data-go="resume">Resume room ${esc(saved.code)} (${saved.players.length} players)</button>` : ''}
    <div class="ribbon">${ORDER.map(g => `<span style="--c:${g.color}">${esc(g.name)}</span>`).join('')}<span class="soon">Lagos Landlord, coming soon</span></div>
  </div>`;
  app.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    unlockAudio();
    const g = b.dataset.go;
    if (g === 'host') startHost(); else if (g === 'join') joinScreen(); else if (g === 'solo') soloMenu(); else if (g === 'resume') startHost(saved);
  }));
}

// ================= HOST (big screen) =================
let eng = null, room = null, setupFor = null, setupState = null;
async function startHost(saved) {
  app.dataset.mode = 'host'; document.body.className = 'tv';
  app.innerHTML = `<div class="center-stack fill">${logo('big')}<p class="lead">Opening the room…</p></div>`;
  keepAwake();
  let code = saved ? saved.code : makeCode(), tries = 0;
  eng = new Engine({ code, send: (conn, msg) => room && room.send(conn, msg), onTV: renderHost });
  window.__gamenight = eng;
  if (saved) eng.restore(saved);
  while (true) {
    try {
      room = await hostRoom(code, {
        onOpen() { },
        onData(conn, m) {
          if (!m || typeof m !== 'object') return;
          if (m.t === 'join') eng.join(String(m.pid || conn).slice(0, 40), m.name, COLORS.includes(m.col) ? m.col : null, conn);
          else if (m.t === 'act') { const p = eng.players.find(x => x.conn === conn); if (p) eng.act(p.pid, m.a); }
        },
        onClose(conn) { eng.offline(conn); }
      });
      break;
    } catch (err) {
      tries++;
      if (err && err.type === 'unavailable-id' && saved && tries < 6) { app.querySelector('.lead').textContent = `Reclaiming room ${code}…`; await new Promise(r => setTimeout(r, 3000)); continue; }
      if (err && err.type === 'unavailable-id' && tries < 8) { code = makeCode(); eng.code = code; continue; }
      app.innerHTML = `<div class="center-stack fill">${logo('big')}<h2>Could not open a room</h2><p class="lead">${esc(err.message || err.type || err)}</p><button class="btn" onclick="location.reload()">Try again</button></div>`;
      return;
    }
  }
  eng.code = code;
  app.innerHTML = `<header class="bar">${logo()}<span class="roomcode">Room <b>${code}</b></span><span class="grow"></span><span id="pcount" class="muted"></span>${muteBtn()}<button class="iconbtn" data-ui="endgame" hidden>End game</button><button class="iconbtn" data-ui="leave">Close room</button></header>
    <main id="stage" class="stage"></main><div id="modal"></div>`;
  delegate($('#stage'), a => eng.act('host', a));
  app.addEventListener('click', hostUI);
  loadQR().then(() => renderHost());
  eng.save(); renderHost();
}

let qrLib = null;
function loadQR() {
  if (window.qrcode) return Promise.resolve();
  if (!qrLib) qrLib = new Promise(res => { const s = document.createElement('script'); s.src = 'https://unpkg.com/qrcode-generator@1.4.4/qrcode.js'; s.onload = res; s.onerror = res; document.head.appendChild(s); });
  return qrLib;
}
function qrSVG(text) {
  try { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (e) { return ''; }
}

function hostUI(e) {
  const b = e.target.closest('[data-ui]'); if (!b) return;
  const u = b.dataset.ui;
  if (u === 'leave') { if (b.dataset.sure) { room && room.close(); try { localStorage.removeItem('gamenight-host'); } catch (x) { } location.href = location.pathname + (useLocal ? '?net=local' : ''); } else { b.dataset.sure = 1; b.textContent = 'Tap again to close'; setTimeout(() => { delete b.dataset.sure; b.textContent = 'Close room'; }, 3000); } }
  if (u === 'endgame') { if (b.dataset.sure) { eng.act('host', { k: '__end' }); delete b.dataset.sure; } else { b.dataset.sure = 1; b.textContent = 'Tap again to end'; setTimeout(() => { delete b.dataset.sure; b.textContent = 'End game'; }, 3000); } }
  if (u === 'kick') eng.kick(b.dataset.pid);
  if (u === 'setup') openSetup(b.dataset.id, false);
  if (u === 'close-setup') { setupFor = null; $('#modal').innerHTML = ''; }
  if (u === 'reset') { if (b.dataset.sure) eng.resetScores(); else { b.dataset.sure = 1; b.textContent = 'Tap again to reset'; } }
}

function renderHost() {
  const stage = $('#stage'); if (!stage) return;
  const online = eng.players.filter(p => p.online).length;
  $('#pcount').textContent = `${online} on phone${online === 1 ? '' : 's'}`;
  const eb = app.querySelector('[data-ui="endgame"]'); if (eb) eb.hidden = eng.phase !== 'game';
  stage.dataset.phase = eng.phase; stage.dataset.game = eng.gameId || '';
  if (eng.phase === 'game' && eng.game) {
    patch(stage, `<div class="gamehead"><span class="gdot" style="--c:${eng.game.color}">${eng.game.glyph}</span><b>${esc(eng.game.name)}</b>${eng.game.rules ? `<span class="rules">${esc(eng.game.rules)}</span>` : ''}</div><div class="gamebody">${eng.game.tv(eng.ctxCur, eng.gs)}</div>`);
    eng.game.afterTV && eng.game.afterTV(stage, eng.ctxCur, eng.gs);
    return;
  }
  if (eng.phase === 'results') { patch(stage, resultsTV(eng.results, eng)); return; }
  patch(stage, lobbyTV());
  if (setupFor) openSetup(setupFor, false, true);
}

function lobbyTV() {
  const url = joinURL(eng.code);
  const qr = window.qrcode ? qrSVG(url) : '';
  const night = eng.players.slice().sort((a, b) => b.score - a.score);
  const anyScore = night.some(p => p.score);
  return `<div class="lobby">
    <section class="joincard">
      <p class="muted">Join on your phone</p>
      <div class="bigcode">${eng.code.split('').map(c => `<span>${c}</span>`).join('')}</div>
      ${qr ? `<div class="qr">${qr}</div>` : ''}
      <p class="url">${esc(url.replace(/^https?:\/\//, ''))}</p>
      <div class="plist">${eng.players.length ? eng.players.map(p => `<span class="chip ${p.online ? '' : 'off'}">${av(p, 'sm')} ${esc(p.name)}<button data-ui="kick" data-pid="${esc(p.pid)}" aria-label="Remove ${esc(p.name)}">×</button></span>`).join('') : '<p class="muted">Waiting for players…</p>'}</div>
    </section>
    <section class="pickgame">
      <h2>Pick a game</h2>
      <div class="ggrid">${ORDER.map(g => `<button class="gtile ${eng.played.includes(g.id) ? 'done' : ''}" style="--c:${g.color}" data-ui="setup" data-id="${g.id}"><span class="gdot">${g.glyph}</span><b>${esc(g.name)}</b><span>${esc(g.blurb)}</span><em>${esc(g.players)}</em></button>`).join('')}
        <div class="gtile soon"><span class="gdot">£</span><b>Lagos Landlord</b><span>Buy Lekki, dodge omo-onile. Coming soon.</span></div></div>
    </section>
    <section class="night">
      <h2>Tonight’s leaderboard</h2>
      ${anyScore ? `<ol>${night.map(p => `<li>${av(p, 'sm')}<span>${esc(p.name)}</span><b>${p.score}</b></li>`).join('')}</ol><button class="linkbtn" data-ui="reset">Reset scores</button>` : '<p class="muted">Win games to collect points: 3 for first, 2 for second, 1 for third.</p>'}
    </section></div>`;
}

function setupDefaults(g, solo) {
  const opts = {}; (g.options || []).forEach(o => { opts[o.key] = o.def; });
  const humans = solo ? ['me'] : eng.players.filter(p => p.online).map(p => p.pid).slice(0, g.max);
  const bots = g.cpu ? (solo ? g.cpu.soloDef : Math.max(0, Math.min(g.cpu.max, (g.cpu.fill || 2) - humans.length))) : 0;
  return { opts, pids: humans, bots };
}
function setupCheck(g, st, solo) {
  const h = st.pids.length, t = h + st.bots;
  if (solo) return g.cpu && t < 2 ? 'Add at least one CPU player' : '';
  if (g.cpu) { if (h < 1) return 'Need at least 1 player on a phone'; if (t < 2) return 'Add a CPU or another player'; if (t > g.max) return `Max ${g.max} players for this game`; return ''; }
  if (h < g.min) return `Needs at least ${g.min} players on their phones (${h} selected)`;
  if (h > g.max) return `Max ${g.max} players`;
  return '';
}
function setupHTML(g, st, solo) {
  const err = setupCheck(g, st, solo);
  const opts = (g.options || []).filter(o => solo ? true : !o.solo).filter(o => !(solo && g.solo === 'onephone' && (o.key === 'rounds' && g.id === 'draw'))).map(o => `<label class="opt-row"><span>${esc(o.label)}</span><select data-opt="${o.key}">${o.choices.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(st.opts[o.key]) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`).join('');
  const who = solo ? '' : `<div class="who"><span>Who’s playing</span><div>${eng.players.map(p => `<label class="chip ${p.online ? '' : 'off'}"><input type="checkbox" data-who="${esc(p.pid)}" ${st.pids.includes(p.pid) ? 'checked' : ''}>${av(p, 'sm')} ${esc(p.name)}</label>`).join('') || '<p class="muted">Nobody has joined yet</p>'}</div></div>`;
  const cpu = g.cpu ? `<div class="opt-row"><span>CPU players</span><div class="stepper"><button data-cpu="-1" aria-label="Fewer CPU">−</button><b>${st.bots}</b><button data-cpu="1" aria-label="More CPU">+</button></div></div>` : '';
  const how = solo && g.solo === 'onephone' ? '<p class="note">One-phone mode: pass this device around the room.</p>' : '';
  return `<div class="modal-bg" data-ui="close-setup"></div><div class="modal" role="dialog" aria-label="${esc(g.name)} setup" style="--c:${g.color}">
    <div class="mhead"><span class="gdot">${g.glyph}</span><div><h2>${esc(g.name)}</h2><p>${esc(g.blurb)}</p></div><button class="iconbtn" data-ui="close-setup">Close</button></div>
    ${g.rules ? `<p class="note">${esc(g.rules)}</p>` : ''}${g.note ? `<p class="note">${esc(g.note)}</p>` : ''}${how}
    ${who}${cpu}${opts}
    ${err ? `<p class="err">${esc(err)}</p>` : ''}
    <button class="btn huge" data-start ${err ? 'disabled' : ''}>Start ${esc(g.name)}</button></div>`;
}
function openSetup(id, solo, refresh) {
  const g = GAMES[id]; if (!g) return;
  if (!refresh || setupFor !== id || !setupState) setupState = setupDefaults(g, solo);
  setupFor = id;
  if (!solo) setupState.pids = setupState.pids.filter(pid => eng.players.some(p => p.pid === pid));
  const m = $('#modal'); m.innerHTML = setupHTML(g, setupState, solo);
  m.onchange = e => {
    const t = e.target;
    if (t.dataset.opt) setupState.opts[t.dataset.opt] = t.value;
    if (t.dataset.who) { const pid = t.dataset.who; setupState.pids = t.checked ? [...setupState.pids, pid] : setupState.pids.filter(x => x !== pid); }
    openSetup(id, solo, true);
  };
  m.onclick = e => {
    const c = e.target.closest('[data-cpu]');
    if (c) { const mx = Math.min(g.cpu.max, g.max - (solo ? 1 : setupState.pids.length)); setupState.bots = Math.max(0, Math.min(mx, setupState.bots + +c.dataset.cpu)); openSetup(id, solo, true); return; }
    if (e.target.closest('[data-start]')) {
      if (setupCheck(g, setupState, solo)) return;
      const st = setupState; setupFor = null; m.innerHTML = '';
      unlockAudio();
      if (solo) startSolo(id, st); else eng.startGame(id, st);
    }
    if (solo && e.target.closest('[data-ui="close-setup"]')) { setupFor = null; m.innerHTML = ''; }
  };
}

function resultsTV(r, engine) {
  const g = GAMES[r.gameId];
  const night = engine.players.slice().sort((a, b) => b.score - a.score);
  const place = n => ['1st', '2nd', '3rd'][n] || `${n + 1}th`;
  return `<div class="results" style="--c:${g.color}">
    <div class="res-main"><p class="pill">${esc(r.gameName)} · final</p><h1 class="display">${esc(r.title || (r.rows[0] ? r.rows[0].name + ' wins!' : 'Game over'))}</h1>
      <ol class="podium">${r.rows.map(x => `<li class="pl${x.place}">${av(x)}<span class="pn">${esc(x.name)}</span><span class="pp">${engine.solo && r.rows.length < 2 ? '' : place(x.place)}</span>${r.unit !== '' ? `<span class="ps">${x.s} ${esc(r.unit)}</span>` : ''}${x.pts && !engine.solo ? `<b class="plus">+${x.pts}</b>` : '<span></span>'}</li>`).join('')}</ol>
      ${r.lines.length ? `<div class="reslines">${r.lines.map(l => `<p>${l}</p>`).join('')}</div>` : ''}
      ${r.forfeit ? `<div class="forfeit"><span>Forfeit for ${esc(r.forfeit.name)}</span><b>${esc(r.forfeit.text)}</b></div>` : ''}
      ${engine.solo ? '<button class="btn huge" data-ui="again">Play again</button>' : ''}<button class="btn ${engine.solo ? 'ghost' : 'huge'}" data-a='${A({ k: '__back' })}'>${engine.solo ? 'Back to games' : 'Back to lobby'}</button></div>
    ${engine.solo ? '' : `<aside class="night"><h2>Tonight</h2><ol>${night.map(p => `<li>${av(p, 'sm')}<span>${esc(p.name)}</span><b>${p.score}</b></li>`).join('')}</ol></aside>`}
  </div>`;
}

// ================= PHONE =================
let conn = null, myPid = null, phoneView = null, reconnecting = false, joinInfo = null;
function joinScreen(err) {
  app.dataset.mode = 'join'; document.body.className = 'phone';
  const name = store.get('name', ''), col = store.get('col', COLORS[Math.random() * COLORS.length | 0]);
  const code = (params.get('join') || '').toUpperCase().slice(0, 4);
  app.innerHTML = `<div class="joinwrap">${logo('big')}
    <form class="form" id="joinform"><label>Room code<input id="jcode" name="code" maxlength="4" autocapitalize="characters" autocomplete="off" required value="${esc(code)}" placeholder="ABCD" class="codein"></label>
    <label>Your name<input id="jname" name="name" maxlength="14" required value="${esc(name)}" placeholder="e.g. Seun"></label>
    <div class="colpick">${COLORS.map(c => `<label><input type="radio" name="col" value="${c}" ${c === col ? 'checked' : ''}><i style="--c:${c}"></i></label>`).join('')}</div>
    ${err ? `<p class="err">${esc(err)}</p>` : ''}<button class="btn huge" type="submit">Join</button></form>
    <button class="linkbtn" id="backhome">Back</button></div>`;
  $('#backhome').onclick = () => { history.replaceState(null, '', location.pathname + (useLocal ? '?net=local' : '')); home(); };
  $('#joinform').onsubmit = e => {
    e.preventDefault(); unlockAudio();
    const f = new FormData(e.target);
    const c = String(f.get('code')).toUpperCase().replace(/[^A-Z]/g, ''); const n = String(f.get('name')).trim(); const cl = f.get('col');
    if (c.length !== 4) return joinScreen('The code has 4 letters');
    store.set('name', n); store.set('col', cl);
    connect(c, n, cl);
  };
}
async function connect(code, name, col) {
  joinInfo = { code, name, col };
  const ids = store.get('pids', {});
  myPid = (!params.get('fresh') && ids[code]) || ('p' + Math.random().toString(36).slice(2, 10));
  ids[code] = myPid; store.set('pids', ids);
  if (!reconnecting) app.innerHTML = `<div class="center-stack fill">${logo('big')}<p class="lead">Joining ${esc(code)}…</p></div>`;
  try {
    conn = await joinRoom(code, { onData: phoneData, onClose: lostConn });
    conn.send({ t: 'join', pid: myPid, name, col });
    reconnecting = false; keepAwake();
    const ov = $('#reconn'); if (ov) ov.remove();
  } catch (err) {
    if (reconnecting) { setTimeout(() => connect(code, name, col), 3000); return; }
    joinScreen(err.message || 'Could not join');
  }
}
function lostConn() {
  if (reconnecting) return;
  reconnecting = true;
  if (!$('#reconn')) { const d = document.createElement('div'); d.id = 'reconn'; d.innerHTML = '<div><b>Reconnecting…</b><p>Keep this page open. If the host closed the room, go back.</p><button class="btn ghost" onclick="location.reload()">Go back</button></div>'; document.body.appendChild(d); }
  setTimeout(() => connect(joinInfo.code, joinInfo.name, joinInfo.col), 1500);
}
function phoneShell() {
  if ($('#pmain')) return;
  app.dataset.mode = 'phone'; document.body.className = 'phone';
  app.innerHTML = `<header class="pbar"><span id="pme"></span><span class="grow"></span><span class="roomcode sm"><span class="rlabel">Room</span> <b>${esc(joinInfo.code)}</b></span>${muteBtn()}</header><main id="pmain" class="pmain"></main>`;
  delegate($('#pmain'), a => { if (conn) conn.send({ t: 'act', a }); });
}
function phoneData(m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'welcome') return;
  if (m.t === 'kicked') { conn && conn.close(); conn = null; reconnecting = true; app.innerHTML = `<div class="center-stack fill">${logo('big')}<h2>You were removed from the room</h2><button class="btn" onclick="location.reload()">OK</button></div>`; return; }
  if (m.t === 'full') { joinScreen('That room is full (16 players)'); return; }
  if (m.t === 'view') { setClockOffset(Date.now() - m.now); renderPhone(m.v); }
}
let lastScreen = '';
function renderPhone(v) {
  phoneShell(); phoneView = v;
  $('#pme').innerHTML = `${av(v.me)} <b>${esc(v.me.name)}</b> <span class="muted">${v.me.score || 0} pts</span>`;
  const main = $('#pmain');
  const key = v.screen + (v.game || '');
  if (key !== lastScreen) { lastScreen = key; if (v.screen === 'game') sfx('start'); if (navigator.vibrate) try { navigator.vibrate(30); } catch (e) { } }
  main.dataset.screen = v.screen;
  if (v.screen === 'lobby') {
    const rank = v.night.findIndex(p => p.pid === v.me.pid) + 1;
    patch(main, `<div class="center-stack"><div class="bigav">${av(v.me, 'xl')}</div><h1 class="display">You’re in, ${esc(v.me.name)}!</h1><p class="lead">Look at the big screen. The host is picking a game.</p>
      <p class="muted">${v.count} in the room${v.me.score ? ` · you’re #${rank} tonight` : ''}</p></div>`);
    return;
  }
  if (v.screen === 'watch') { patch(main, `<div class="center-stack"><h2>${esc(v.gameName)} is on</h2><p class="lead">You’re watching this one. You’ll be in the next game.</p></div>`); return; }
  if (v.screen === 'results') {
    const r = v.results, me = r.rows.find(x => x.pid === v.me.pid);
    const ff = r.forfeit && r.forfeit.pid === v.me.pid;
    patch(main, `<div class="result ${me && me.place === 0 ? 'good' : ''}"><p class="pill">${esc(r.gameName)}</p><h2>${me ? (me.place === 0 ? 'You won!' : `You came ${['1st', '2nd', '3rd'][me.place] || me.place + 1 + 'th'}`) : 'Game over'}</h2>
      ${me && me.pts ? `<p class="big">+${me.pts} pts</p>` : ''}${ff ? `<div class="forfeit"><span>Your forfeit</span><b>${esc(r.forfeit.text)}</b></div>` : ''}<p class="muted">Look at the big screen</p></div>`);
    return;
  }
  const g = GAMES[v.game]; if (!g) return;
  patch(main, `<div class="pgame" data-g="${g.id}">${g.renderPhone(v.data)}</div>`);
  g.mountPhone && g.mountPhone(main, v.data, a => conn && conn.send({ t: 'act', a }));
}

// ================= SOLO =================
function soloMenu() {
  app.dataset.mode = 'solo'; document.body.className = 'phone solo';
  const list = ORDER.filter(g => g.solo);
  app.innerHTML = `<header class="pbar">${logo()}<span class="grow"></span>${muteBtn()}<button class="iconbtn" id="sback">Home</button></header>
    <main class="pmain"><h1 class="display sm">Play solo</h1><p class="muted">"One phone" games are for a group sharing this device.</p>
    <div class="ggrid solo">${list.map(g => `<button class="gtile" style="--c:${g.color}" data-id="${g.id}"><span class="gdot">${g.glyph}</span><b>${esc(g.name)}</b><span>${esc(g.blurb)}</span><em>${g.solo === 'onephone' ? 'One phone, pass it round' : g.cpu ? 'You vs CPU' : 'Just you'}</em></button>`).join('')}</div></main><div id="modal"></div>`;
  $('#sback').onclick = home;
  app.querySelectorAll('.gtile[data-id]').forEach(b => b.onclick = () => { unlockAudio(); openSetup(b.dataset.id, true); });
}
function startSolo(id, st) {
  const g = GAMES[id];
  document.body.className = 'phone solo playing';
  app.innerHTML = `<header class="pbar"><span class="gdot" style="--c:${g.color}">${g.glyph}</span><b>${esc(g.name)}</b><span class="grow"></span>${muteBtn()}<button class="iconbtn" id="squit">Quit</button></header>
    <main class="solo-main"><div id="stage" class="stage solo-stage"></div><div id="pad" class="pmain pad"></div></main>${g.rules ? `<details class="rulesbox"><summary>Rules</summary><p>${esc(g.rules)}</p></details>` : ''}`;
  keepAwake();
  const stage = $('#stage'), pad = $('#pad');
  const se = new Engine({
    solo: true,
    onTV: () => {
      if (se.phase === 'game' && se.game) { patch(stage, se.game.tv(se.ctxCur, se.gs)); se.game.afterTV && se.game.afterTV(stage, se.ctxCur, se.gs); }
      else if (se.phase === 'results') patch(stage, resultsTV(se.results, se));
      else if (se.started) { se.started = false; soloMenu(); }
    },
    onSolo: v => {
      if (v.screen !== 'game') { patch(pad, ''); pad.hidden = true; return; }
      const html = GAMES[v.game].renderPhone(v.data);
      pad.hidden = !html; patch(pad, html);
      GAMES[v.game].mountPhone && GAMES[v.game].mountPhone(pad, v.data, a => se.act('me', a));
    }
  });
  eng = se;
  delegate(stage, a => se.act('me', a)); delegate(pad, a => se.act('me', a));
  $('#squit').onclick = () => { se.clearTimers(); se.ctxCur = null; soloMenu(); };
  stage.addEventListener('click', e => { if (e.target.closest('[data-ui="again"]')) { se.clearTimers(); se.ctxCur = null; startSolo(id, st); } });
  se.join('me', store.get('name', '') || 'You', store.get('col', COLORS[0]), null);
  se.started = true;
  se.startGame(id, { opts: st.opts, pids: ['me'], bots: st.bots });
}

// ================= boot =================
if (params.get('join')) joinScreen(); else home();
