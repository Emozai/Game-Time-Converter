# Live ship position — setup (about 10 minutes, one time)

The Game Time Converter asks this small Cloudflare Worker for the Norwegian Escape's live AIS position.
The Worker gets it from aisstream.io (free) and keeps the last known position.

## 1. Get a free aisstream.io key
1. Go to https://aisstream.io/authenticate and sign in (GitHub account).
2. Open **API Keys** → **Create New API Key** → copy the key.

## 2. Create the Worker
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Create Worker**.
2. Name it exactly **shipposition** → **Deploy**.
3. **Edit code** → delete everything → paste all of `worker.js` → **Deploy**.

## 3. Settings (Worker → Settings)
- **Variables and Secrets** → Add → Type **Secret**, name `AISSTREAM_KEY`, value = your key.
- **Bindings** → Add → **KV namespace** → variable name `SHIP` → namespace **ship-position** (already created).
- **Triggers** → **Cron Triggers** → Add → **Every 5 minutes** (`*/5 * * * *`).

## 4. Check it
Open https://shipposition.emozailanada.workers.dev/ — you should see the ship's position as text (lat, lon, speed).
The first position can take a few minutes (in port the ship only sends its position every ~3 minutes).

## Good to know
- AIS comes from shore receivers. Far out at sea there may be no signal for hours; the site then shows
  "Last AIS position" with how old it is, and still uses the voyage plan for the route and arrival times.
- Needs internet. Offline, the page shows the estimate from the voyage plan as before.
- Free plans are enough (Workers Free + KV Free + aisstream.io free).
