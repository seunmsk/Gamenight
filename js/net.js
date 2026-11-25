// Transport layer. Default: PeerJS (WebRTC, no server of our own).
// ?net=local uses BroadcastChannel so you can test host + phones in tabs of one browser.
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
export async function hostRoom(code, h) {
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
        send(connId, data) { const c = conns.get(connId); if (c && c.open) { try { c.send(data); } catch (e) { console.warn(e); } } },
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
export async function joinRoom(code, h) {
  code = code.toUpperCase();
  if (useLocal) {
    const id = 'c' + Math.random().toString(36).slice(2, 9);
    const bc = new BroadcastChannel(PREFIX + code);
    bc.onmessage = e => { const m = e.data; if (m && m.to === id) h.onData(m.data); };
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
