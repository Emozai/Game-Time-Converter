# Game Time Converter

Converts NFL and live-event kickoff times into **ship time** for the Norwegian Escape, based on the ship's voyage plan.

**Live site:** https://emozai.github.io/Game-Time-Converter/

## Install on a phone (Android & iPhone)
Open the live site on the phone, then:
- **iPhone / iPad (Safari):** tap **Share ⬆︎ → Add to Home Screen → Add**.
- **Android (Chrome / Samsung Internet):** tap **Install app** on the page, or **⋮ menu → Install app / Add to Home screen**.

It opens full-screen from the home screen with its own icon, and keeps working without internet using the last voyage plan and schedule it loaded.

## Updating for a new voyage or game week
1. Open the site and load the new voyage plan PDF (step 1). Check the UTC column.
2. Paste the new game schedule (step 3).
3. Click **Save as site-data.json** and upload it to this repository, replacing the old file.

Everyone sees the update when they refresh the page.

`lib/` contains PDF.js by Mozilla (Apache License 2.0).
