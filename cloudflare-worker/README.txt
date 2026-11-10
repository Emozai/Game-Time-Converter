NCL DUAL-CALL LOOKUP (Cloudflare Worker)
========================================
The Game Time Converter asks this worker which other Norwegian Cruise Line
ships are in the same port on each itinerary day. The worker reads the
port's monthly schedule on CruiseMapper.com, keeps only NCL ships, and
caches the answer for 6 hours. CruiseMapper is credited on the site.

DEPLOY (about 2 minutes, free)
  1. Go to dash.cloudflare.com -> Workers & Pages -> Create -> Create Worker.
  2. Name it:  ncl-dualcalls   -> Deploy.
  3. Click "Edit code", delete the sample code, paste all of
     ncl-dualcalls.js, then click Deploy.
  4. The address will be  https://ncl-dualcalls.emozailanada.workers.dev
     (the site already uses this address). If yours is different, paste it
     in the site: Voyage plan -> "NCL dual-call lookup".

TEST IT
  Open in a browser:
  https://ncl-dualcalls.emozailanada.workers.dev/?port=Port%20Canaveral&month=2026-11&debug=1
  You should see "ok": true and a list of NCL ships under "calls".
  If "calls" is empty but "rows" is above 0, CruiseMapper changed its page:
  send the "sample" text so the reader can be adjusted.

PORTS
  Common NCL ports are built in. Other ports are looked up automatically.
  If a port isn't found, add its CruiseMapper id to PORT_IDS at the top of
  the file (the number at the end of the CruiseMapper port link,
  e.g. .../ports/nassau-port-27 -> 27).
