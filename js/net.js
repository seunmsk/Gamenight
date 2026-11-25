// Transport layer.
// Default: Supabase Realtime relay (works on any network: Wi-Fi, MTN, Airtel, Glo).
// Fallback when no key is set: PeerJS (direct WebRTC).
// ?net=local uses BroadcastChannel so you can test host + phones in tabs of one browser.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
const SUPA_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
const PEER_SRC = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'gamenight-ng-';
export const useLocal = new URLSearchParams(location.search).get('net') === 'local';

let peerLoad = null;
function loadPeer() {
  if (window.Peer) return Promise.resolve();
  if (!peerLoad) peerLoad = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = PEER_SRC; s.onload = res;
    s.onerror = () => { peerLoad = null; rej(new Error('Could not load the connection library. Check your internet.')); };
    document.head.appendChild(s);
  });
  return peerLoad;
}

export function makeCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c = ''; for (let i = 0; i < 4; i++) c += L[Math.random() * L.length | 0];
  return c;
}

// Host: handlers {onOpen(connId), onData(connId,msg), onClose(connId)}
async function peerHost(code, h) {
  if (useLocal) {
    const bc = new BroadcastChannel(PREFIX + code);
    const known = new Set();
    bc.onmessage = e => {
      const m = e.data; if (!m || m.to !== 'host') return;
      if (m.hello) { known.add(m.from); h.onOpen(m.from); return; }
      if (m.bye) { known.delete(m.from); h.onClose(m.from); return; }
      h.onData(m.from, m.data);
    };
    return {
      code,
      send(connId, data) { bc.postMessage({ to: connId, from: 'host', data }); },
      sendMany(list, extra = {}) { list.forEach(([c, d]) => bc.postMessage({ to: c, from: 'host', data: { ...d, ...extra } })); },
      close() { bc.close(); }
    };
  }
  await loadPeer();
  return new Promise((resolve, reject) => {
    const peer = new window.Peer(PREFIX + code, { debug: 1 });
    const conns = new Map();
    let opened = false;
    peer.on('open', () => {
      opened = true;
      resolve({
        code, peer,
        send(connId, data) { const list = connId === '*' ? [...conns.values()] : [conns.get(connId)]; for (const c of list) if (c && c.open) { try { c.send(data); } catch (e) { console.warn(e); } } },
        close() { try { peer.destroy(); } catch (e) { } }
      });
    });
    peer.on('connection', conn => {
      conn.on('open', () => { conns.set(conn.connectionId, conn); h.onOpen(conn.connectionId); });
      conn.on('data', d => h.onData(conn.connectionId, d));
      const gone = () => { if (conns.get(conn.connectionId) === conn) { conns.delete(conn.connectionId); h.onClose(conn.connectionId); } };
      conn.on('close', gone); conn.on('error', gone);
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { } });
    peer.on('error', err => {
      if (!opened) { try { peer.destroy(); } catch (e) { } reject(err); }
      else console.warn('peer error', err.type);
    });
  });
}

// Phone: handlers {onData(msg), onClose()}
async function peerJoin(code, h) {
  code = code.toUpperCase();
  if (useLocal) {
    const id = 'c' + Math.random().toString(36).slice(2, 9);
    const bc = new BroadcastChannel(PREFIX + code);
    bc.onmessage = e => { const m = e.data; if (m && (m.to === id || m.to === '*')) h.onData(m.data); };
    bc.postMessage({ to: 'host', from: id, hello: true });
    addEventListener('beforeunload', () => bc.postMessage({ to: 'host', from: id, bye: true }));
    return { send(data) { bc.postMessage({ to: 'host', from: id, data }); }, close() { bc.close(); } };
  }
  await loadPeer();
  return new Promise((resolve, reject) => {
    const peer = new window.Peer({ debug: 1 });
    let done = false;
    const fail = e => { if (!done) { done = true; try { peer.destroy(); } catch (x) { } reject(e); } };
    const t = setTimeout(() => fail(new Error('Room not answering. Check the code and that the host screen is open.')), 15000);
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', () => {
        done = true; clearTimeout(t);
        resolve({ send(d) { if (conn.open) { try { conn.send(d); } catch (e) { console.warn(e); } } }, close() { try { peer.destroy(); } catch (e) { } } });
      });
      conn.on('data', d => h.onData(d));
      conn.on('close', () => { if (done) h.onClose(); });
      conn.on('error', () => { if (done) h.onClose(); });
    });
    peer.on('error', err => {
      if (err.type === 'peer-unavailable') fail(new Error('No room with that code. Check the big screen.'));
      else if (!done) fail(err); else h.onClose();
    });
  });
}

// ---------------- Supabase Realtime relay ----------------
const useSupa = !useLocal && !!SUPABASE_KEY;
let sbLoad = null, sbClient = null;
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the connection library. Check your internet.')); document.head.appendChild(s); });
}
async function sb() {
  if (!window.supabase) { sbLoad = sbLoad || loadScript(SUPA_SRC).catch(e => { sbLoad = null; throw e; }); await sbLoad; }
  sbClient = sbClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 50 } } });
  return sbClient;
}
const BAD = ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'];
function presenceReady(ch, ms) {
  return new Promise(res => { let t = setTimeout(res, ms); ch.on('presence', { event: 'sync' }, () => { clearTimeout(t); setTimeout(res, 150); }); });
}

async function supaHost(code, h) {
  const c = await sb();
  const ch = c.channel(PREFIX + code, { config: { broadcast: { self: false, ack: false }, presence: { key: 'host' } } });
  const ready = presenceReady(ch, 2500);
  ch.on('broadcast', { event: 'up' }, ({ payload }) => {
    if (!payload || typeof payload.from !== 'string') return;
    h.onData(payload.from, payload.data);
  });
  ch.on('presence', { event: 'leave' }, ({ key }) => { if (key && key !== 'host') h.onClose(key); });
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; c.removeChannel(ch); reject(new Error('Could not reach the game server. Check your internet and try again.')); } }, 20000);
    ch.subscribe(async status => {
      if (status === 'SUBSCRIBED' && !done) {
        await ready;
        const st = ch.presenceState();
        if (st.host && st.host.length) { done = true; clearTimeout(t); c.removeChannel(ch); const e = new Error('Room code in use'); e.type = 'unavailable-id'; return reject(e); }
        await ch.track({ host: true, t: Date.now() });
        done = true; clearTimeout(t);
        const post = payload => ch.send({ type: 'broadcast', event: 'down', payload });
        resolve({
          code,
          send(connId, data) { post({ to: connId, data }); },
          sendMany(list, extra = {}) { if (list.length) post({ many: list, ...extra }); },
          close() { try { c.removeChannel(ch); } catch (e) { } }
        });
      } else if (BAD.includes(status) && !done) { done = true; clearTimeout(t); try { c.removeChannel(ch); } catch (e) { } reject(new Error('Could not reach the game server. Check your internet and try again.')); }
    });
  });
}

async function supaJoin(code, h) {
  code = code.toUpperCase();
  const c = await sb();
  const id = 'c' + Math.random().toString(36).slice(2, 10);
  const ch = c.channel(PREFIX + code, { config: { broadcast: { self: false, ack: false }, presence: { key: id } } });
  const ready = presenceReady(ch, 4000);
  ch.on('broadcast', { event: 'down' }, ({ payload }) => {
    if (!payload) return;
    if (payload.many) { const m = payload.many.find(x => x[0] === id); if (m) { const d = { ...m[1] }; if ('tv' in payload) d.tv = payload.tv; if ('tvx' in payload) d.tvx = payload.tvx; h.onData(d); } return; }
    if (payload.to === id || payload.to === '*') h.onData(payload.data);
  });
  return new Promise((resolve, reject) => {
    let done = false, closed = false;
    const fail = msg => { if (!done) { done = true; clearTimeout(t); try { c.removeChannel(ch); } catch (e) { } reject(new Error(msg)); } };
    const t = setTimeout(() => fail('Could not reach the game server. Check your internet and try again.'), 20000);
    ch.subscribe(async status => {
      if (status === 'SUBSCRIBED' && !done) {
        await ready;
        const st = ch.presenceState();
        if (!st.host || !st.host.length) return fail('No room with that code. Check the big screen.');
        await ch.track({ phone: true });
        done = true; clearTimeout(t);
        resolve({
          send(data) { ch.send({ type: 'broadcast', event: 'up', payload: { from: id, data } }); },
          close() { closed = true; try { c.removeChannel(ch); } catch (e) { } }
        });
      } else if (BAD.includes(status)) {
        if (!done) fail('Could not reach the game server. Check your internet and try again.');
        else if (!closed) { closed = true; try { c.removeChannel(ch); } catch (e) { } h.onClose(); }
      }
    });
  });
}

export const hostRoom = (code, h) => useSupa ? supaHost(code, h) : peerHost(code, h);
export const joinRoom = (code, h) => useSupa ? supaJoin(code, h) : peerJoin(code, h);
