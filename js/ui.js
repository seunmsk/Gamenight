// Shared helpers for Game Night
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const pick = a => a[Math.random() * a.length | 0];
export const sample = (a, n) => shuffle(a).slice(0, n);
export const A = obj => esc(JSON.stringify(obj)); // for data-a attributes

export const COLORS = ['#ff4f6d', '#f5b301', '#16c2a3', '#4f8cff', '#b45cff', '#ff8a3d', '#2fd06b', '#ff5cc8', '#00b8d9', '#e0e0e0', '#c8a36b', '#8bd450'];

export function av(p, cls = '') {
  if (!p) return '';
  const ini = (p.name || '?').trim().slice(0, 2).toUpperCase();
  return `<span class="av ${cls}" style="--c:${esc(p.col || '#888')}">${esc(ini)}</span>`;
}

// countdown element; `end` is host time (ms). Phones correct for clock offset.
export const timer = (end, cls = '') => `<span class="timer ${cls}" data-end="${+end || 0}">--</span>`;

export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

// Night points from a score map: 3/2/1 for the top three (ties share), 0 after.
export function rankScores(scores) {
  const arr = Object.entries(scores).map(([pid, s]) => ({ pid, s })).sort((a, b) => b.s - a.s);
  let place = 0, last = null;
  arr.forEach((r, i) => { if (r.s !== last) { place = i; last = r.s; } r.place = place; r.pts = [3, 2, 1][place] || 0; });
  return arr;
}

// ---- tiny sound kit (WebAudio, no files) ----
let ac = null;
export function unlockAudio() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { } }
function tone(f, d, type = 'sine', v = 0.15, when = 0) {
  if (!ac) return;
  try {
    const o = ac.createOscillator(), g = ac.createGain(); const t = ac.currentTime + when;
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  } catch (e) { }
}
let muted = false;
try { muted = localStorage.getItem('gamenight-mute') === '1'; } catch (e) { }
export const isMuted = () => muted;
export function setMuted(m) { muted = m; try { localStorage.setItem('gamenight-mute', m ? '1' : '0'); } catch (e) { } }
export function sfx(name) {
  if (muted) return;
  switch (name) {
    case 'tick': tone(880, 0.06, 'square', 0.05); break;
    case 'ok': tone(660, 0.1, 'triangle'); tone(990, 0.16, 'triangle', 0.15, 0.08); break;
    case 'bad': tone(180, 0.25, 'sawtooth', 0.08); break;
    case 'join': tone(520, 0.08, 'triangle'); tone(780, 0.12, 'triangle', 0.15, 0.07); break;
    case 'card': tone(300, 0.05, 'square', 0.05); break;
    case 'dice': for (let i = 0; i < 5; i++) tone(200 + Math.random() * 300, 0.04, 'square', 0.04, i * 0.05); break;
    case 'win': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.15, i * 0.12)); break;
    case 'start': [392, 523, 659].forEach((f, i) => tone(f, 0.15, 'triangle', 0.13, i * 0.09)); break;
  }
}

// ---- countdown ticker shared by TV + phones ----
let clockOffset = 0; // localNow - hostNow
export const setClockOffset = o => { clockOffset = o; };
setInterval(() => {
  const now = Date.now();
  document.querySelectorAll('[data-end]').forEach(el => {
    const end = +el.dataset.end; if (!end) { el.textContent = ''; return; }
    const left = Math.max(0, Math.ceil((end + (el.closest('[data-local]') ? 0 : clockOffset) - now) / 1000));
    const txt = String(left);
    if (el.textContent !== txt) { el.textContent = txt; el.classList.toggle('low', left <= 5); }
  });
}, 250);

// Render html into el while keeping typed input values and focus.
export function patch(el, html) {
  if (el._html === html) return;
  const keep = {}; let focusId = null, selS = null, selE = null;
  el.querySelectorAll('input[id],textarea[id]').forEach(i => { if (i.type !== 'file' && i.type !== 'radio' && i.type !== 'checkbox') keep[i.id] = i.value; });
  const ae = document.activeElement;
  if (ae && el.contains(ae) && ae.id) { focusId = ae.id; try { selS = ae.selectionStart; selE = ae.selectionEnd; } catch (e) { } }
  el.innerHTML = html; el._html = html;
  for (const id in keep) { const i = el.querySelector('#' + CSS.escape(id)); if (i && !i.hasAttribute('data-fresh')) i.value = keep[id]; }
  if (focusId) { const f = el.querySelector('#' + CSS.escape(focusId)); if (f) { f.focus(); try { f.setSelectionRange(selS, selE); } catch (e) { } } }
}

// One delegate per container: [data-a] clicks and form[data-form] submits become actions.
export function delegate(el, send) {
  if (el._delegated) { el._send = send; return; }
  el._delegated = true; el._send = send;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b || !el.contains(b) || b.disabled) return;
    e.preventDefault(); unlockAudio();
    try { el._send(JSON.parse(b.dataset.a)); } catch (err) { console.error(err); }
  });
  el.addEventListener('submit', e => {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault();
    const data = { k: f.dataset.form };
    new FormData(f).forEach((v, k) => { data[k] = v; });
    el._send(data);
    if (f.hasAttribute('data-clear')) f.querySelectorAll('input[type=text],textarea').forEach(i => { i.value = ''; });
  });
}

export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
}
