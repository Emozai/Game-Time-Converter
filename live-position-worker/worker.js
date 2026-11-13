/* Ship Position — live AIS position of Norwegian Escape for the Game Time Converter.
   Made by JVL - Broadcast

   How it works
   - Every 5 minutes (Cron Trigger) it listens to aisstream.io for the ship's AIS messages
     and saves the newest position in KV, so there is always a "last known" position.
   - The website calls this Worker and gets that position as JSON.
   - If the saved position is older than 10 minutes, a request also listens briefly for a new one.

   Settings in the Cloudflare dashboard (Worker > Settings):
   - Variables and Secrets: AISSTREAM_KEY  (Secret)  = your aisstream.io API key
   - Bindings: KV namespace, variable name SHIP
   - Triggers: Cron Trigger, "Every 5 minutes"
*/
const MMSI = '311000341';            // Norwegian Escape (IMO 9677076)
const SHIP_NAME = 'Norwegian Escape';
const KEY = 'pos-' + MMSI;
const STALE_MS = 10 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

const NAV = ['Under way using engine', 'At anchor', 'Not under command', 'Restricted manoeuvrability',
  'Constrained by draught', 'Moored', 'Aground', 'Engaged in fishing', 'Under way sailing'];

// aisstream time looks like "2026-11-13 11:20:31.123456789 +0000 UTC"
function parseTime(t) {
  if (!t) return Date.now();
  const m = String(t).match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  const ms = m ? Date.parse(m[1] + 'T' + m[2] + 'Z') : NaN;
  return isNaN(ms) ? Date.now() : ms;
}

// Listen to aisstream.io for up to `waitMs`. Returns what was heard (position and/or voyage data).
async function listen(env, waitMs) {
  if (!env.AISSTREAM_KEY) throw new Error('AISSTREAM_KEY secret is not set');
  const resp = await fetch('https://stream.aisstream.io/v0/stream', { headers: { Upgrade: 'websocket' } });
  const ws = resp.webSocket;
  if (!ws) throw new Error('Could not open the aisstream connection (HTTP ' + resp.status + ')');
  ws.accept();
  ws.send(JSON.stringify({
    APIKey: env.AISSTREAM_KEY,
    BoundingBoxes: [[[-90, -180], [90, 180]]],
    FiltersShipMMSI: [MMSI],
    FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ShipStaticData']
  }));

  const got = {};
  await new Promise(resolve => {
    const done = () => { try { ws.close(1000, 'done'); } catch (e) {} resolve(); };
    const timer = setTimeout(done, waitMs);
    ws.addEventListener('message', ev => {
      let msg;
      try {
        const txt = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
        msg = JSON.parse(txt);
      } catch (e) { return; }
      if (msg.error) { got.error = msg.error; clearTimeout(timer); done(); return; }
      const md = msg.MetaData || {};
      const body = (msg.Message || {})[msg.MessageType] || {};
      if (msg.MessageType === 'ShipStaticData') {
        got.destination = (body.Destination || '').trim() || undefined;
        const e = body.Eta || {};
        if (e.Month && e.Day) got.eta = { month: e.Month, day: e.Day, hour: e.Hour, minute: e.Minute };
      } else {
        const lat = body.Latitude ?? md.latitude, lon = body.Longitude ?? md.longitude;
        if (typeof lat === 'number' && typeof lon === 'number' && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
          got.pos = {
            lat, lon,
            sog: typeof body.Sog === 'number' && body.Sog < 102.3 ? body.Sog : null,
            cog: typeof body.Cog === 'number' && body.Cog < 360 ? body.Cog : null,
            heading: typeof body.TrueHeading === 'number' && body.TrueHeading < 360 ? body.TrueHeading : null,
            status: NAV[body.NavigationalStatus] || null,
            time: parseTime(md.time_utc)
          };
          clearTimeout(timer); done();   // a position is what we came for
        }
      }
    });
    ws.addEventListener('close', () => { clearTimeout(timer); resolve(); });
    ws.addEventListener('error', () => { clearTimeout(timer); resolve(); });
  });
  if (got.error) throw new Error('aisstream: ' + got.error);
  return got;
}

async function refresh(env, waitMs) {
  const old = (await env.SHIP.get(KEY, 'json')) || {};
  const got = await listen(env, waitMs);
  if (!got.pos && !got.destination) return old;
  const rec = { ...old, ship: SHIP_NAME, mmsi: MMSI };
  if (got.pos) Object.assign(rec, got.pos);
  if (got.destination) rec.destination = got.destination;
  if (got.eta) rec.eta = got.eta;
  rec.checked = Date.now();
  await env.SHIP.put(KEY, JSON.stringify(rec));
  return rec;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (!env.SHIP) return new Response(JSON.stringify({ error: 'KV binding SHIP is missing' }), { status: 500, headers: CORS });
    let rec = await env.SHIP.get(KEY, 'json');
    let note = null;
    if (!rec || !rec.time || Date.now() - rec.time > STALE_MS) {
      try { rec = await refresh(env, 20000); } catch (e) { note = String(e.message || e); }
    }
    if (!rec || typeof rec.lat !== 'number') {
      return new Response(JSON.stringify({ ok: false, error: note || 'No AIS position received yet — try again in a few minutes.' }), { status: 503, headers: CORS });
    }
    return new Response(JSON.stringify({ ok: true, ...rec, ageMin: Math.round((Date.now() - rec.time) / 60000), note }), { headers: CORS });
  },
  async scheduled(event, env, ctx) {
    if (env.SHIP) ctx.waitUntil(refresh(env, 200000).catch(() => {}));
  }
};
