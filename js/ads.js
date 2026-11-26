// Sponsored slots on the TV lobby. Ads live in Supabase (table gamenight_ads, managed at /admin/ads/).
// Only live ads are returned to the public key; dates are checked again here.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const ADS_CONTACT = 'Want your event or product on this screen? Talk to MSK.';
const ROTATE_MS = 12000, RELOAD_MS = 10 * 60 * 1000;
let ads = [], idx = 0, started = false;

const today = () => new Date().toISOString().slice(0, 10);
const live = a => a.active !== false && (!a.starts_on || a.starts_on <= today()) && (!a.ends_on || a.ends_on >= today());

async function load() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const H = { apikey: SUPABASE_KEY };
    if (SUPABASE_KEY.startsWith('eyJ')) H.Authorization = 'Bearer ' + SUPABASE_KEY;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/gamenight_ads?select=id,title,body,link,image_url,sort,starts_on,ends_on,active&order=sort.asc,created_at.desc`, { headers: H });
    if (!r.ok) return;
    ads = (await r.json()).filter(live);
    ads.forEach(a => { if (a.image_url) { const i = new Image(); i.src = a.image_url; } });
    if (idx >= ads.length) idx = 0;
  } catch (e) { }
}

export function currentAd() { return ads.length ? ads[idx % ads.length] : null; }
export function adCount() { return ads.length; }
export function adIndex() { return ads.length ? idx % ads.length : 0; }

// onTick re-renders the lobby; called after loading and on every rotation
export function startAds(onTick) {
  if (started) return; started = true;
  load().then(onTick);
  setInterval(() => { if (ads.length > 1) { idx = (idx + 1) % ads.length; onTick(); } }, ROTATE_MS);
  setInterval(() => load().then(onTick), RELOAD_MS);
}
