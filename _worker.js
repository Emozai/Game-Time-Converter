/* Game Time Converter — Cloudflare Pages worker (_worker.js)
   Serves the website as usual, plus /api/position: the ship's live position from CruiseMapper.
   Upload this file together with the rest of the site (drag and drop works) — nothing else to set up.

   GET /api/position            → Norwegian Escape's latest AIS position (cached 5 minutes)
   GET /api/position?debug=1    → also returns what was found on the page (troubleshooting)
   Source: CruiseMapper.com (credited on the site).
   Made by JVL - Broadcast */

const SHIP = { name: 'Norwegian Escape', imo: '9677076', mmsi: '311000341', cmId: 878 };
const SHIP_PAGE = 'https://www.cruisemapper.com/ships/Norwegian-Escape-' + SHIP.cmId;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' };

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS, ...extra } });
}
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };
const okLL = (a, o) => a != null && o != null && Math.abs(a) <= 90 && Math.abs(o) <= 180 && !(a === 0 && o === 0);

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&deg;/g, '°')
    .replace(/\s+/g, ' ');
}

// Coordinates: try the patterns CruiseMapper pages use for the map marker.
function findCoords(html) {
  const pats = [
    /data-lat(?:itude)?=["'](-?\d+(?:\.\d+)?)["'][^>]*?data-(?:lon|lng|longitude)=["'](-?\d+(?:\.\d+)?)["']/i,
    /["']?lat(?:itude)?["']?\s*[:=]\s*["']?(-?\d+\.\d+)["']?\s*,\s*["']?(?:lon|lng|longitude)["']?\s*[:=]\s*["']?(-?\d+\.\d+)/i,
    /LatLng\(\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\)/i,
    /setView\(\s*\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/i,
    /center\s*[:=]\s*\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/i
  ];
  for (const re of pats) {
    const m = html.match(re);
    if (m) { const a = num(m[1]), o = num(m[2]); if (okLL(a, o)) return { lat: a, lon: o }; }
  }
  // "28.41° N, 80.61° W" style text
  const t = htmlToText(html).match(/(\d{1,2}(?:\.\d+)?)\s*°\s*([NS])[ ,/|]+(\d{1,3}(?:\.\d+)?)\s*°\s*([EW])/i);
  if (t) { const a = num(t[1]) * (/s/i.test(t[2]) ? -1 : 1), o = num(t[3]) * (/w/i.test(t[4]) ? -1 : 1); if (okLL(a, o)) return { lat: a, lon: o }; }
  return null;
}

// The sentence on the ship page: "The current location of Norwegian Escape is in North West Atlantic Ocean
// cruising at speed of 21.2 kn (…) en route to Ponta Delgada. The AIS position was last reported 41 minutes ago."
function readSentence(text) {
  const out = {};
  const s = text.match(/current (?:location|position) of [^.]*?\bis\s+(?:in|at|near)\s+(.{2,140}?)(?=\s+(?:cruising|sailing|docked|moored|anchored|at speed|with speed|en route|heading)\b|\.\s)/i);
  if (s) out.area = s[1].replace(/\s*\(.*$/, '').trim();
  const sp = text.match(/speed of\s+(\d+(?:\.\d+)?)\s*(?:kn|knots)/i); if (sp) out.sog = num(sp[1]);
  const d = text.match(/en route to\s+([^.(]{2,80})/i); if (d) out.destination = d[1].trim();
  if (/\b(docked|moored|in port|berthed)\b/i.test((text.match(/current (?:location|position) of[^.]{0,260}\./i) || [''])[0])) out.status = 'In port';
  else if (/\banchored|at anchor\b/i.test((text.match(/current (?:location|position) of[^.]{0,260}\./i) || [''])[0])) out.status = 'At anchor';
  else if (out.sog != null) out.status = out.sog > 0.5 ? 'Under way' : null;
  const ago = text.match(/last reported\s+(\d+)\s+(second|minute|hour|day)s?\s+ago/i);
  if (ago) out.time = Date.now() - (+ago[1]) * ({ second: 1e3, minute: 6e4, hour: 36e5, day: 864e5 })[ago[2].toLowerCase()];
  return out;
}

// CruiseMapper's map feed (used by its live map) — a second way to get exact coordinates.
async function fromMapFeed() {
  const urls = [
    `https://www.cruisemapper.com/map/ships.json?imo=${SHIP.imo}&mmsi=${SHIP.mmsi}&minLat=-90&maxLat=90&minLon=-180&maxLon=180&zoom=2&filter=`,
    `https://www.cruisemapper.com/map/ships.json?imo=${SHIP.imo}`
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://www.cruisemapper.com/?imo=' + SHIP.imo } });
      if (!r.ok) continue;
      const data = await r.json();
      const list = Array.isArray(data) ? data : (data.ships || data.data || data.items || []);
      const s = list.find(x => String(x.imo || x.IMO || '') === SHIP.imo || String(x.mmsi || x.MMSI || '') === SHIP.mmsi ||
        String(x.name || x.ship_name || x.title || '').toLowerCase() === SHIP.name.toLowerCase());
      if (!s) continue;
      const lat = num(s.lat ?? s.latitude ?? s.ship_lat), lon = num(s.lon ?? s.lng ?? s.longitude ?? s.ship_lon);
      if (!okLL(lat, lon)) continue;
      const ts = s.ts || s.timestamp || s.time || s.updated || s.last_update;
      let time = null;
      if (ts) { const n = +ts; time = isFinite(n) ? (n < 1e12 ? n * 1000 : n) : Date.parse(ts); if (!isFinite(time)) time = null; }
      return { lat, lon, sog: num(s.sog ?? s.speed), cog: num(s.cog ?? s.course), heading: num(s.hdg ?? s.heading), time, via: 'map' };
    } catch (e) {}
  }
  return null;
}

async function position(request) {
  const u = new URL(request.url), debug = !!u.searchParams.get('debug');
  const cache = caches.default, key = new Request('https://cache.local/position/' + SHIP.imo);
  if (!debug) { const hit = await cache.match(key); if (hit) return new Response(hit.body, hit); }

  let html = '', pageStatus = 0;
  try {
    const r = await fetch(SHIP_PAGE, { headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' } });
    pageStatus = r.status; if (r.ok) html = await r.text();
  } catch (e) {}
  const text = html ? htmlToText(html) : '';
  const info = text ? readSentence(text) : {};
  let ll = html ? findCoords(html) : null, via = ll ? 'page' : null;
  let feed = null;
  if (!ll) { feed = await fromMapFeed(); if (feed) { ll = { lat: feed.lat, lon: feed.lon }; via = 'map'; } }

  const rec = {
    ok: !!(ll || info.area), ship: SHIP.name, imo: SHIP.imo,
    lat: ll ? ll.lat : null, lon: ll ? ll.lon : null,
    sog: info.sog ?? (feed && feed.sog), cog: feed ? feed.cog : null,
    status: info.status || null, area: info.area || null, destination: info.destination || null,
    time: info.time || (feed && feed.time) || null,
    source: 'CruiseMapper.com', url: SHIP_PAGE, via, checked: Date.now()
  };
  if (!rec.ok) rec.error = pageStatus && pageStatus !== 200 ? 'CruiseMapper returned ' + pageStatus : 'Position not found on CruiseMapper';
  if (debug) {
    rec.debug = { pageStatus, htmlLength: html.length,
      sentence: (text.match(/current (?:location|position) of[^.]{0,260}\.[^.]{0,120}\./i) || [null])[0],
      latHints: (html.match(/.{0,60}\blat[a-z]*\b.{0,80}/gi) || []).slice(0, 8) };
  }
  const res = json(rec, rec.ok ? 200 : 502);
  if (rec.ok && !debug) {
    await cache.put(key, new Response(JSON.stringify(rec), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'max-age=300', ...CORS } }));
  }
  return res;
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method === 'OPTIONS' && path.startsWith('/api/')) return new Response(null, { headers: CORS });
    if (path === '/api/position' || path.startsWith('/api/position/')) {
      try { return await position(request); }
      catch (e) { return json({ ok: false, error: 'Lookup failed: ' + (e && e.message || e), source: 'CruiseMapper.com' }, 500); }
    }
    return env.ASSETS.fetch(request);   // everything else: the normal website files
  }
};
