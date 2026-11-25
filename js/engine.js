// The host brain. Runs on the big screen (party) or on the one device (solo).
import { rankScores, sfx, pick, COLORS } from './ui.js';
import { FORFEITS } from './content.js';
import { GAMES } from './games/index.js';

const BOT_NAMES = ['CPU Tunde', 'CPU Ngozi', 'CPU Musa', 'CPU Bisi', 'CPU Emeka'];

export class Engine {
  constructor({ solo = false, code = '', send = () => { }, onTV = () => { }, onSolo = null, onSoloFx = null }) {
    Object.assign(this, { solo, code, send, onTV, onSolo, onSoloFx });
    this.players = []; this.phase = 'lobby'; this.gameId = null; this.game = null; this.gs = null;
    this.ctxCur = null; this.timers = {}; this.results = null; this.played = [];
  }
  human(pid) { return this.players.find(p => p.pid === pid); }

  join(pid, name, col, conn, look) {
    look = /^\d-\d$/.test(String(look || '')) ? look : null;
    name = String(name || 'Player').slice(0, 16).trim() || 'Player';
    let p = this.human(pid);
    if (p) { p.name = name; p.col = col || p.col; p.look = look || p.look; p.conn = conn; p.online = true; }
    else {
      if (this.players.length >= 16) { this.send(conn, { t: 'full' }); return; }
      p = { pid, name, look, col: col || COLORS[this.players.length % COLORS.length], score: 0, online: true, conn };
      this.players.push(p); sfx('join');
    }
    this.send(conn, { t: 'welcome', pid });
    this.sync(); this.save();
  }
  offline(conn) {
    const p = this.players.find(x => x.conn === conn);
    if (p) { p.online = false; p.conn = null; this.sync(); }
  }
  kick(pid) {
    const p = this.human(pid); if (!p) return;
    if (p.conn) this.send(p.conn, { t: 'kicked' });
    this.players = this.players.filter(x => x !== p); this.sync(); this.save();
  }
  resetScores() { this.players.forEach(p => { p.score = 0; }); this.played = []; this.sync(); this.save(); }

  makeCtx(parts, opts) {
    const eng = this;
    const ctx = {
      solo: this.solo, opts, players: parts,
      humans: () => parts.filter(p => !p.bot),
      p: pid => parts.find(x => x.pid === pid),
      name: pid => (parts.find(x => x.pid === pid) || eng.human(pid) || { name: '?' }).name,
      isCtl: pid => pid === 'host' || eng.solo,
      online: pid => { const h = eng.human(pid); return eng.solo || (h && h.online); },
      after(k, ms, fn) {
        clearTimeout(eng.timers[k]);
        eng.timers[k] = setTimeout(() => { delete eng.timers[k]; if (eng.ctxCur !== ctx) return; try { fn(); } catch (e) { console.error(e); } }, ms);
      },
      cancel(k) { clearTimeout(eng.timers[k]); delete eng.timers[k]; },
      sync: () => { if (eng.ctxCur === ctx && !eng._starting) eng.sync(); },
      fx(msg, toPid) {
        if (eng.solo) { eng.onSoloFx && eng.onSoloFx(msg); return; }
        for (const p of eng.players) if (p.online && p.conn && (!toPid || p.pid === toPid)) eng.send(p.conn, { t: 'fx', fx: msg });
      },
      finish: (scores, extra) => { if (eng.ctxCur === ctx) eng.finish(scores, extra); },
      sfx
    };
    return ctx;
  }

  startGame(id, { opts = {}, pids = [], bots = 0 } = {}) {
    const game = GAMES[id]; if (!game) return;
    this.clearTimers();
    const parts = pids.map(pid => this.human(pid)).filter(Boolean).map(p => ({ pid: p.pid, name: p.name, col: p.col, look: p.look }));
    for (let i = 0; i < bots; i++) parts.push({ pid: 'cpu' + (i + 1), name: BOT_NAMES[i], col: ['#9aa0a6', '#c8a36b', '#7fb3a8', '#a99bd6', '#d6a29b'][i], look: ['2-1', '5-3', '3-0', '0-2', '6-4'][i], bot: true });
    const ctx = this.makeCtx(parts, opts);
    this.ctxCur = ctx; this.game = game; this.gameId = id; this.phase = 'game'; this.results = null;
    sfx('start');
    this._starting = true;
    try { this.gs = game.start(ctx, opts); } finally { this._starting = false; }
    if (this.ctxCur === ctx) this.sync();
  }

  endGame() { this.clearTimers(); this.ctxCur = null; this.phase = 'lobby'; this.game = null; this.gs = null; this.sync(); }

  finish(scores, extra = {}) {
    this.clearTimers();
    const ctx = this.ctxCur; this.ctxCur = null;
    const ranked = rankScores(scores);
    const vals = ranked.map(r => r.s);
    if (vals.length > 1 && Math.max(...vals) === Math.min(...vals)) ranked.forEach(r => { r.pts = vals[0] > 0 ? 1 : 0; });
    const rows = ranked.map(r => {
      const pp = ctx.p(r.pid) || {};
      const h = this.human(r.pid);
      const pts = pp.bot ? 0 : r.pts;
      if (h) h.score += pts;
      return { pid: r.pid, name: pp.name || (h && h.name) || '?', col: pp.col, look: pp.look, s: r.s, place: r.place, pts, bot: !!pp.bot };
    });
    const humans = rows.filter(r => !r.bot);
    let forfeit = null;
    if (!this.solo && humans.length >= 3) {
      const last = humans[humans.length - 1];
      if (last.place > 0) forfeit = { pid: last.pid, name: last.name, text: pick(FORFEITS) };
    }
    this.results = { gameId: this.gameId, gameName: this.game.name, rows, forfeit, title: extra.title || '', lines: extra.lines || [], unit: extra.unit || 'pts' };
    this.played.push(this.gameId);
    this.phase = 'results'; this.game = null; this.gs = null;
    sfx('win'); this.sync(); this.save();
  }

  act(pid, a) {
    if (!a || typeof a !== 'object') return;
    const ctl = pid === 'host' || this.solo;
    if (a.k === '__end' && ctl) return this.endGame();
    if (a.k === '__back' && ctl && this.phase === 'results') { this.phase = 'lobby'; this.results = null; return this.sync(); }
    if (this.phase !== 'game' || !this.game) return;
    const ctx = this.ctxCur;
    if (pid !== 'host' && !this.solo && !ctx.p(pid)) return; // spectators can't act
    try {
      const r = this.game.act(ctx, this.gs, this.solo ? 'me' : pid, a);
      if (r !== false && this.ctxCur === ctx) this.sync();
    } catch (e) { console.error(e); }
  }

  viewFor(pid) {
    const p = this.human(pid);
    const me = p ? { pid, name: p.name, col: p.col, look: p.look, score: p.score } : { pid, name: 'You' };
    const base = { me, code: this.code };
    if (this.phase === 'game' && this.game) {
      if (!this.ctxCur.p(pid)) return { ...base, screen: 'watch', game: this.gameId, gameName: this.game.name };
      return { ...base, screen: 'game', game: this.gameId, data: this.game.phone(this.ctxCur, this.gs, pid) };
    }
    if (this.phase === 'results') return { ...base, screen: 'results', results: this.results };
    const night = this.players.map(x => ({ pid: x.pid, name: x.name, col: x.col, look: x.look, score: x.score })).sort((a, b) => b.score - a.score);
    return { ...base, screen: 'lobby', night, count: this.players.length };
  }

  sync() {
    if (this._syncing) { this._again = true; return; }
    this._syncing = true;
    try {
      do {
        this._again = false;
        this.onTV();
        if (this.solo) { this.onSolo && this.onSolo(this.viewFor('me')); }
        else for (const p of this.players) if (p.online && p.conn) this.send(p.conn, { t: 'view', now: Date.now(), v: this.viewFor(p.pid) });
      } while (this._again);
    } finally { this._syncing = false; }
  }

  clearTimers() { for (const k in this.timers) clearTimeout(this.timers[k]); this.timers = {}; }

  save() {
    if (this.solo) return;
    try { localStorage.setItem('gamenight-host', JSON.stringify({ code: this.code, t: Date.now(), played: this.played, players: this.players.map(({ pid, name, col, look, score }) => ({ pid, name, col, look, score })) })); } catch (e) { }
  }
  restore(saved) {
    this.players = (saved.players || []).map(p => ({ ...p, online: false, conn: null }));
    this.played = saved.played || [];
  }
}
