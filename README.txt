GAME TIME CONVERTER
===================

WHAT'S IN THIS FOLDER
  index.html        The website (open this page)
  site-data.json    The current voyage plan + game schedule everyone sees
  lib/              PDF reader, so voyage-plan PDFs load with no internet
  README.txt        This file

PUT IT ONLINE (pick one)
  1. Ship intranet / crew portal (best, works without internet)
     Ask IT to copy this whole folder to any web server on the ship
     network. Crew open  http://<server>/<folder>/index.html
  2. Netlify Drop (free, internet needed)
     Go to app.netlify.com/drop and drag this folder onto the page.
     You get a public link in a few seconds.
  3. GitHub Pages (free, internet needed)
     Upload the folder's files to a GitHub repository and turn on
     Settings > Pages.

  Keep the files together: index.html, site-data.json and the lib folder
  must stay in the same place.

UPDATE FOR A NEW VOYAGE OR NEW GAME WEEK
  1. Open the website.
  2. Step 1: load the new voyage plan PDF and check the UTC column.
  3. Step 3: paste the new game schedule.
  4. Click "Save as site-data.json" (in the Voyage plan box).
  5. Replace site-data.json on the server with the new file.
  Every crew member then sees the new voyage plan and schedule the next
  time they open or refresh the page.

NOTES
  - Ship time comes from the voyage plan, not from each person's phone,
    so it is right wherever they are and whatever their phone is set to.
  - Clocks are assumed to change at 02:00 ship time. Change "Clocks change
    at" if the bridge does it at another hour, then save site-data.json again.
  - Opening index.html straight from a USB stick or desktop works for
    converting, but the PDF reader and site-data.json only load when the
    folder is served from a web server.

lib/ contains PDF.js by Mozilla, licensed under the Apache License 2.0.
