/* NCL dual-call lookup — Cloudflare Worker
   Reads a port's monthly cruise ship schedule from CruiseMapper.com and returns only
   Norwegian Cruise Line ships, so the Game Time Converter can show dual calls.
   Source: CruiseMapper.com (credited on the site). Results are cached for 6 hours.

   GET /?port=Puerto%20Plata&month=2026-11            → NCL ships in that port that month
   GET /?port=...&month=...&id=1936                    → use a known CruiseMapper port id
   GET /?port=...&month=...&debug=1                    → also return a text sample (troubleshooting)
   Made by JVL - Broadcast */

const NCL_FLEET = ['Norwegian Aqua','Norwegian Luna','Norwegian Prima','Norwegian Viva','Norwegian Encore','Norwegian Bliss',
  'Norwegian Joy','Norwegian Escape','Norwegian Getaway','Norwegian Breakaway','Norwegian Epic','Norwegian Gem','Norwegian Jade',
  'Norwegian Pearl','Norwegian Jewel','Norwegian Dawn','Norwegian Star','Norwegian Sun','Norwegian Sky','Norwegian Spirit','Pride of America'];

// CruiseMapper port ids (any slug works with the right id: /ports/x-port-<id>)
const PORT_IDS = {
  'port canaveral': 42, 'canaveral': 42, 'orlando': 42,
  'puerto plata': 1936, 'amber cove': 1936, 'taino bay': 1936,
  'st. thomas': 604, 'st thomas': 604, 'saint thomas': 604, 'charlotte amalie': 604,
  'tortola': 35, 'road town': 35,
  'great stirrup cay': 1023,
  'nassau': 27, 'cozumel': 26, 'miami': 40, 'barcelona': 82,
  'fort lauderdale': 44, 'port everglades': 44, 'st croix': 823, 'st. croix': 823, 'frederiksted': 823
};

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra } });
}
const pad = n => String(n).padStart(2, '0');

function knownId(port) {
  const k = port.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/,.*$/, '').replace(/\s+/g, ' ').trim();
  if (PORT_IDS[k]) return PORT_IDS[k];
  const full = port.toLowerCase();
  const hit = Object.keys(PORT_IDS).find(p => full.includes(p));
  return hit ? PORT_IDS[hit] : null;
}

async function findPortId(port) {
  const id = knownId(port);
  if (id) return id;
  // look the port up once with a web search, then cache the answer for 30 days
  const cache = caches.default, key = new Request('https://cache.local/portid/' + encodeURIComponent(port.toLowerCase()));
  const hit = await cache.match(key);
  if (hit) return +(await hit.text()) || null;
  const q = 'site:cruisemapper.com/ports ' + port.replace(/,.*$/, '').replace(/\(.*?\)/g, '');
  try {
    const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), { headers: { 'User-Agent': UA } });
    const html = decodeURIComponent((await r.text()).replace(/&amp;/g, '&'));
    const m = html.match(/cruisemapper\.com\/ports\/[a-z0-9-]+-port-(\d+)/i);
    if (m) { await cache.put(key, new Response(m[1], { headers: { 'Cache-Control': 'max-age=2592000' } })); return +m[1]; }
  } catch (e) {}
  return null;
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<img[^>]*?(?:alt|title)="([^"]*)"[^>]*>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
}

/* Schedule rows read like: "13 November, 2026 Friday … Norwegian Cruise Line … Norwegian Getaway 07:00 16:00".
   Split the page text at each "D Month, YYYY" date and read the ship and times that follow it. */
function parseSchedule(text, month) {
  const re = new RegExp('(\\d{1,2})\\s+(' + MONTHS.join('|') + '),?\\s+(\\d{4})', 'gi');
  const marks = []; let m;
  while ((m = re.exec(text))) marks.push({ i: m.index, end: re.lastIndex, d: +m[1], mo: MONTHS.indexOf(m[2].toLowerCase()) + 1, y: +m[3] });
  const calls = []; let rows = 0;
  for (let k = 0; k < marks.length; k++) {
    const a = marks[k], seg = text.slice(a.end, k + 1 < marks.length ? marks[k + 1].i : a.end + 400);
    const date = a.y + '-' + pad(a.mo) + '-' + pad(a.d);
    if (month && date.slice(0, 7) !== month) continue;
    rows++;
    let ship = NCL_FLEET.find(n => seg.toLowerCase().includes(n.toLowerCase()));
    const isNcl = /norwegian cruise line|\bNCL\b/i.test(seg);
    if (!ship && isNcl) { const s = seg.match(/(Norwegian\s+[A-Z][a-z]+)(?!\s+Cruise)/); if (s) ship = s[1]; }
    if (!ship) continue;
    const times = (seg.match(/(?:[01]\d|2[0-3]):[0-5]\d|(?<!\d)\d:[0-5]\d/g) || []).slice(0, 2).map(t => t.padStart(5, '0'));
    calls.push({ date, ship, arr: times.length === 2 ? times[0] : '', dep: times.length === 2 ? times[1] : (times[0] || ''), times });
  }
  // the same call can appear twice on the page (calendar + table): keep one
  const seen = new Set();
  return { rows, calls: calls.filter(c => { const k = c.date + c.ship; if (seen.has(k)) return false; seen.add(k); return true; }) };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const u = new URL(request.url);
    const port = (u.searchParams.get('port') || '').trim();
    const month = (u.searchParams.get('month') || '').trim();
    if (!port || !/^\d{4}-\d{2}$/.test(month)) {
      return json({ ok: false, error: 'Use ?port=Port%20Name&month=YYYY-MM', source: 'CruiseMapper.com' }, 400);
    }
    const id = +(u.searchParams.get('id') || '') || await findPortId(port);
    if (!id) return json({ ok: false, port, month, error: 'Port not found on CruiseMapper', source: 'CruiseMapper.com' }, 404);

    const pageUrl = `https://www.cruisemapper.com/ports/port-${id}?month=${month}`;
    const cache = caches.default, cacheKey = new Request(`https://cache.local/sched/${id}/${month}`);
    let html = null, cached = false;
    const hit = await cache.match(cacheKey);
    if (hit) { html = await hit.text(); cached = true; }
    else {
      const r = await fetch(pageUrl, { headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' } });
      if (!r.ok) return json({ ok: false, port, month, id, url: pageUrl, error: 'CruiseMapper returned ' + r.status, source: 'CruiseMapper.com' }, 502);
      html = await r.text();
      await cache.put(cacheKey, new Response(html, { headers: { 'Cache-Control': 'max-age=21600' } }));
    }
    const text = htmlToText(html);
    const { rows, calls } = parseSchedule(text, month);
    const out = { ok: true, port, month, id, url: pageUrl, rows, calls, cached, source: 'CruiseMapper.com', checked: Date.now() };
    if (u.searchParams.get('debug')) out.sample = text.slice(text.search(/\d{1,2}\s+[A-Z][a-z]+,\s+\d{4}/), 1500);
    return json(out, 200, { 'Cache-Control': 'public, max-age=1800' });
  }
};
