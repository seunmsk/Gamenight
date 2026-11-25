// Hand-built SVG characters. look = "style-skin", e.g. "3-1".
export const STYLES = [
  { id: 'gele', name: 'Gele Queen' },
  { id: 'agbada', name: 'Agbada Boss' },
  { id: 'hoodie', name: 'Hoodie Guy' },
  { id: 'jersey', name: 'Baller' },
  { id: 'braids', name: 'Braids Babe' },
  { id: 'afro', name: 'Afro Vibes' },
  { id: 'bucket', name: 'Bucket Hat' },
  { id: 'locs', name: 'Loc’d Up' }
];
export const SKINS = ['#a8693a', '#8d5524', '#6e3f1c', '#5a3214', '#c28452'];

const INK = '#1a0f1f';
let uid = 0;

export function shade(hex, f) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (isNaN(n)) return hex;
  let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
export function parseLook(look, seed = '') {
  const m = /^(\d+)-(\d+)$/.exec(String(look || ''));
  if (m) return { s: Math.min(+m[1], STYLES.length - 1), k: Math.min(+m[2], SKINS.length - 1) };
  const h = hash(seed); return { s: h % STYLES.length, k: (h >> 3) % SKINS.length };
}

const ARMS = {
  idle: [[26, 98], [74, 98]],
  up: [[20, 22], [80, 22]],
  wave: [[26, 98], [82, 26]],
  dance: [[16, 56], [84, 36]],
  mic: [[26, 98], [64, 52]],
  sad: [[34, 100], [66, 100]]
};

function arm(x1, y1, [x2, y2], sleeve, skin, short) {
  const mx = x1 + (x2 - x1) * (short ? 0.42 : 0.82), my = y1 + (y2 - y1) * (short ? 0.42 : 0.82);
  return `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${skin}" stroke-width="8.5" stroke-linecap="round"/>
    <path d="M${x1} ${y1}L${mx} ${my}" stroke="${sleeve}" stroke-width="11" stroke-linecap="round"/>
    <circle cx="${x2}" cy="${y2}" r="5" fill="${skin}"/>`;
}

function face(kind, skin) {
  const cheek = `<circle cx="39" cy="47" r="3.2" fill="#ff6f86" opacity=".35"/><circle cx="61" cy="47" r="3.2" fill="#ff6f86" opacity=".35"/>`;
  const eye = (x) => `<ellipse cx="${x}" cy="40" rx="2.7" ry="3.3" fill="${INK}"/><circle cx="${x + 0.9}" cy="38.8" r="1" fill="#fff"/>`;
  switch (kind) {
    case 'wow': return `${eye(43)}${eye(57)}<ellipse cx="50" cy="50" rx="3.6" ry="4.4" fill="${INK}"/><ellipse cx="50" cy="51.6" rx="2.2" ry="1.6" fill="#ff6f86"/>${cheek}`;
    case 'sad': return `<path d="M39.5 37.5l6-2.6M60.5 37.5l-6-2.6" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="43" cy="41" rx="2.3" ry="2.6" fill="${INK}"/><ellipse cx="57" cy="41" rx="2.3" ry="2.6" fill="${INK}"/><path d="M45 51.5Q50 47.5 55 51.5" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M60 44q1.5 3 0 4.6q-1.6-1.6 0-4.6z" fill="#7fd3ff"/>`;
    case 'cool': return `<path d="M36 36h12.5v4.2q0 4.4-6.2 4.4t-6.3-4.4zM51.5 36H64v4.2q0 4.4-6.2 4.4t-6.3-4.4z" fill="${INK}"/><path d="M48.5 37.6h3" stroke="${INK}" stroke-width="1.6"/><path d="M38.5 38.2l3-1" stroke="#fff" stroke-width="1" opacity=".6"/><path d="M44 49.5Q50 53.5 56 49" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>${cheek}`;
    case 'laugh': return `<path d="M40 41q3-3.5 6 0M54 41q3-3.5 6 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M42.5 47.5h15q-1 8-7.5 8t-7.5-8z" fill="${INK}"/><path d="M45 52.6q5 2.6 10 0q-1.2 2.8-5 2.8t-5-2.8z" fill="#ff6f86"/>${cheek}`;
    default: return `${eye(43)}${eye(57)}<path d="M43.5 48.5Q50 55 56.5 48.5" stroke="${INK}" stroke-width="2.1" fill="none" stroke-linecap="round"/>${cheek}`;
  }
}

// main renderer
export function character(look, col = '#ff4f6d', o = {}) {
  const { s, k } = parseLook(look, o.seed);
  const st = STYLES[s].id, skin = SKINS[k], dark = shade(col, -0.35), light = shade(col, 0.45);
  const pose = o.pose || 'idle';
  const fk = o.face || (pose === 'sad' ? 'sad' : st === 'bucket' ? 'cool' : pose === 'up' || pose === 'dance' ? 'laugh' : pose === 'sad' ? 'sad' : 'happy');
  const id = 'c' + (++uid);
  const pat = `<pattern id="${id}p" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${col}"/><circle cx="5" cy="5" r="2.6" fill="${light}"/><path d="M0 0l2.5 2.5M10 0l-2.5 2.5M0 10l2.5-2.5M10 10l-2.5-2.5" stroke="${dark}" stroke-width="1.6"/></pattern>`;
  const P = `url(#${id}p)`;
  const [la, ra] = ARMS[pose] || ARMS.idle;
  let back = '', legs = '', body = '', top = '', extra = '', sleeve = col, short = false, hairFront = '';
  const shoe = (c, c2 = '#fff') => `<ellipse cx="40" cy="133" rx="8" ry="4.6" fill="${c}"/><ellipse cx="60" cy="133" rx="8" ry="4.6" fill="${c}"/><path d="M33 134.5h14M53 134.5h14" stroke="${c2}" stroke-width="1.6"/>`;
  const pants = (c, shorts) => shorts
    ? `<path d="M37 112h9v20h-9zM54 112h9v20h-9z" fill="${skin}"/><path d="M33 100h34l2 16H54l-4-8-4 8H31z" fill="${c}"/>`
    : `<path d="M33 100h34l-2 32H54l-4-24-4 24H35z" fill="${c}"/>`;
  const torso = (c, extraD = '') => `<path d="M30 70q0-9 9-9h22q9 0 9 9l2 32H28z" fill="${c}"/>${extraD}`;

  switch (st) {
    case 'gele':
      legs = shoe('#d4a017', '#fff3b0') + `<path d="M31 98h38l5 34H26z" fill="${P}"/><path d="M28 112h44" stroke="${dark}" stroke-width="2.2" opacity=".6"/>`;
      body = torso(col, `<path d="M41 61q9 8 18 0" stroke="${shade(col, -0.2)}" stroke-width="2.4" fill="none"/><path d="M38 66q12 7 24 0" stroke="#ff4f6d" stroke-width="2.6" fill="none" stroke-dasharray="0.1 4.2" stroke-linecap="round"/>`);
      sleeve = col;
      top = `<path d="M23 30Q16 6 36 6Q44-4 56 3Q74-3 80 14Q86 26 77 33Q66 22 50 23Q33 22 23 30z" fill="${P}" stroke="${dark}" stroke-width="1.4"/>
        <path d="M30 18Q42 9 56 14M36 10Q50 2 66 9M60 18Q70 14 76 20" stroke="${dark}" stroke-width="1.6" fill="none" opacity=".75"/>
        <path d="M74 26q11-2 12 8q-8 2-12-3z" fill="${col}" stroke="${dark}" stroke-width="1.2"/>
        <circle cx="31" cy="47" r="2.2" fill="#f5b301"/><circle cx="69" cy="47" r="2.2" fill="#f5b301"/>`;
      break;
    case 'agbada':
      legs = shoe('#3b2a1a', '#6b4a2a') + pants(shade(col, -0.15));
      body = torso(col) ;
      extra = `<path d="M30 63Q14 64 8 120q20 9 42 9t42-9Q86 64 70 63L62 60H38z" fill="${col}" stroke="${dark}" stroke-width="1.3"/>
        <path d="M40 61q10 22 20 0" stroke="#f5b301" stroke-width="2.4" fill="none"/><path d="M44 66q6 13 12 0M50 74v14" stroke="#f5b301" stroke-width="1.6" fill="none" stroke-dasharray="2 2.4"/>`;
      sleeve = shade(col, -0.14);
      top = `<path d="M31 30Q30 15 50 13Q72 12 71 26L72 31Q52 22 31 30z" fill="${dark}"/><path d="M62 15q12 3 12 13l-4 1q0-9-8-14z" fill="${shade(col, -0.5)}"/><path d="M34 26q16-6 36-2" stroke="${light}" stroke-width="1.2" fill="none" opacity=".6"/>`;
      hairFront = `<path d="M31.5 31q1 4 1.5 7M68.5 31q-1 4-1.5 7" stroke="${INK}" stroke-width="2.4"/>`;
      break;
    case 'hoodie':
      legs = shoe('#f4f1ea', '#d0cbc0') + pants('#2f4f8f');
      body = torso(col, `<path d="M40 61q10 10 20 0" fill="${dark}"/><path d="M46 66v12M54 66v12" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><rect x="38" y="86" width="24" height="11" rx="4" fill="${dark}" opacity=".55"/>`);
      top = `<path d="M31 34Q31 17 50 17Q69 17 69 34Q62 27 50 27Q38 27 31 34z" fill="${INK}"/><path d="M29 31Q30 14 50 14Q70 14 71 31Q60 25 50 25Q40 25 29 31z" fill="#222"/><path d="M68 30q11 0 12 4q-6 2-12 0z" fill="#222"/><path d="M33 22q8-4 16-5" stroke="#444" stroke-width="1.4" fill="none"/>`;
      break;
    case 'jersey':
      legs = `<rect x="37" y="117" width="9" height="12" fill="#fff"/><rect x="54" y="117" width="9" height="12" fill="#fff"/>` + shoe(col, '#fff') + pants('#fff', true) + `<path d="M33 101h34" stroke="${col}" stroke-width="3"/>`;
      body = torso(col, `<path d="M40 61l10 9 10-9" stroke="#fff" stroke-width="2.6" fill="none"/><text x="50" y="93" font-family="Arial Black,Arial" font-weight="900" font-size="16" text-anchor="middle" fill="#fff">${(hash(o.seed || look) % 9) + 1}</text><path d="M30 76h4M66 76h4" stroke="#fff" stroke-width="2.4"/>`);
      short = true;
      top = `<path d="M31 36Q30 20 50 19Q70 20 69 36Q64 26 50 26Q36 26 31 36z" fill="${INK}"/><path d="M31 34q-1 4 0 6M69 34q1 4 0 6" stroke="${INK}" stroke-width="2"/>`;
      break;
    case 'braids':
      back = `<g stroke="${INK}" stroke-width="4.2" stroke-linecap="round">${[33, 37, 41, 59, 63, 67].map((x, i) => `<path d="M${x} 34Q${x + (i < 3 ? -4 : 4)} 64 ${x + (i < 3 ? -2 : 2)} ${90 + (i % 3) * 3}"/>`).join('')}</g>${[33, 41, 63].map((x, i) => `<circle cx="${x + (i ? 2 : -2)}" cy="${92 + i * 3}" r="2" fill="#f5b301"/>`).join('')}`;
      legs = shoe('#fff', '#ddd') + pants('#3a64b0') + `<path d="M33 101h34" stroke="#2a4a88" stroke-width="3"/>`;
      body = `<path d="M30 70q0-9 9-9h22q9 0 9 9l1 15H29z" fill="${col}"/><path d="M29 85h42l1 17H28z" fill="${skin}"/><circle cx="50" cy="94" r="1.4" fill="${shade(skin, -0.3)}"/>`;
      short = true;
      top = `<path d="M30 40Q28 17 50 17Q72 17 70 40Q66 26 50 25Q34 26 30 40z" fill="${INK}"/><path d="M40 20q10-4 20 0" stroke="#3a2a40" stroke-width="1.4" fill="none"/>
        <circle cx="31" cy="50" r="3.6" fill="none" stroke="#f5b301" stroke-width="1.6"/><circle cx="69" cy="50" r="3.6" fill="none" stroke="#f5b301" stroke-width="1.6"/>`;
      break;
    case 'afro':
      back = `<circle cx="50" cy="30" r="27" fill="${INK}"/><circle cx="30" cy="22" r="10" fill="${INK}"/><circle cx="70" cy="22" r="10" fill="${INK}"/><circle cx="50" cy="8" r="11" fill="${INK}"/>`;
      legs = shoe('#6b4a2a', '#8b6a4a') + pants('#d9c3a0');
      body = torso(P, `<path d="M41 61l9 10 9-10" fill="#fff8ee"/><path d="M50 71v30" stroke="${dark}" stroke-width="1.2"/><circle cx="50" cy="80" r="1.2" fill="${dark}"/><circle cx="50" cy="90" r="1.2" fill="${dark}"/>`);
      sleeve = P; short = true;
      top = `<path d="M32 30q18-10 36 0" stroke="${INK}" stroke-width="5" fill="none"/>`;
      break;
    case 'bucket':
      legs = shoe('#f4f1ea', '#c9c3b6') + pants('#9a8a5a', true) + `<rect x="34" y="104" width="7" height="6" rx="1" fill="#857647"/><rect x="59" y="104" width="7" height="6" rx="1" fill="#857647"/>`;
      body = `<path d="M27 72q0-11 11-11h24q11 0 11 11l3 31H24z" fill="#f7f3ea"/><circle cx="50" cy="83" r="9" fill="${col}"/><path d="M45 83l3.5 3.5L56 79" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M42 61q8 5 16 0" stroke="#d8d0c0" stroke-width="2" fill="none"/>`;
      sleeve = '#f7f3ea'; short = true;
      top = `<path d="M31 30Q31 13 50 13Q69 13 69 30z" fill="${col}"/><path d="M22 33Q50 23 78 33L74 37Q50 30 26 37z" fill="${dark}"/><path d="M33 22h34" stroke="${light}" stroke-width="1.4" opacity=".7"/>`;
      extra = `<path d="M48 62q2 6 4 0" stroke="#f5b301" stroke-width="1.6" fill="none"/>`;
      break;
    case 'locs':
      back = `<g stroke="${INK}" stroke-width="5.4" stroke-linecap="round">${[32, 38, 62, 68].map((x, i) => `<path d="M${x} 30Q${x + (i < 2 ? -5 : 5)} 50 ${x + (i < 2 ? -4 : 4)} 70"/>`).join('')}</g>`;
      legs = shoe('#222', '#666') + pants('#8f96a3') + `<path d="M36 128h10M54 128h10" stroke="#6d7480" stroke-width="3"/>`;
      body = `<path d="M33 70q0-9 7-9h20q7 0 7 9l4 32H29z" fill="${col}"/><path d="M40 61q10 8 20 0" stroke="${dark}" stroke-width="2" fill="none"/>`;
      sleeve = skin; short = true;
      top = `<path d="M30 33Q29 17 50 17Q71 17 70 33Q62 23 50 23Q38 23 30 33z" fill="${INK}"/><g stroke="${INK}" stroke-width="5" stroke-linecap="round"><path d="M40 22q-3 8-2 14M50 20v10M60 22q3 8 2 14"/></g>
        <path d="M27 40Q27 12 50 12Q73 12 73 40" stroke="#222" stroke-width="3.4" fill="none"/><rect x="22" y="35" width="9" height="14" rx="4" fill="${col}" stroke="#222" stroke-width="2"/><rect x="69" y="35" width="9" height="14" rx="4" fill="${col}" stroke="#222" stroke-width="2"/>`;
      break;
  }

  const lx = 33, rx = 67, sy = 68;
  const mic = pose === 'mic' ? `<rect x="61" y="40" width="5" height="14" rx="2" fill="#333" transform="rotate(-20 64 47)"/><circle cx="62" cy="38" r="5" fill="#888" stroke="#333" stroke-width="1.4"/>` : '';
  const head = `<rect x="44.5" y="54" width="11" height="10" fill="${shade(skin, -0.12)}"/>
    <circle cx="31" cy="42" r="4.4" fill="${skin}"/><circle cx="69" cy="42" r="4.4" fill="${skin}"/>
    <circle cx="50" cy="40" r="19.5" fill="${skin}"/><path d="M33 46q2 10 17 13.5q15-3.5 17-13.5q-4 8-17 9.6q-13-1.6-17-9.6z" fill="${shade(skin, -0.12)}" opacity=".6"/>`;
  const inner = `<defs>${pat}</defs>${back}${legs}${extra && st === 'agbada' ? '' : ''}${body}${extra}
    <g>${arm(lx, sy, la, sleeve, skin, short)}${arm(rx, sy, ra, sleeve, skin, short)}</g>
    ${head}${face(fk, skin)}${hairFront}${top}${mic}`;
  const vb = o.crop ? '16 1 68 68' : '4 -8 92 148';
  const cls = `chr${o.anim ? ' ' + o.anim : ''}${o.cls ? ' ' + o.cls : ''}`;
  return `<svg class="${cls}" viewBox="${vb}" aria-hidden="true">${inner}</svg>`;
}

export const lookName = look => STYLES[parseLook(look).s].name;

// The MC: agbada, mic, speech bubble. `text` must already be safe HTML.
export function mc(text, cls = '') {
  return `<div class="mc ${cls}"><div class="mc-chr">${character('1-1', '#f5b301', { pose: 'mic', seed: 'mc', face: 'laugh' })}</div><div class="bubble">${text}</div></div>`;
}
