# Game Time Converter

Converts NFL and live-event kickoff times into **ship time** for the Norwegian Escape, based on the ship's voyage plan.

**Live site:** https://emozai.github.io/Game-Time-Converter/

## Updating for a new voyage or game week
1. Open the site and load the new voyage plan PDF (step 1). Check the UTC column.
2. Paste the new game schedule (step 3).
3. Click **Save as site-data.json** and upload it to this repository, replacing the old file.

Everyone sees the update when they refresh the page.

`lib/` contains PDF.js by Mozilla (Apache License 2.0).
