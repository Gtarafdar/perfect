# Demo script (v0.2)

Record for social / Cursor team eval. Target **25–40 seconds**.

## Setup (once)

1. `npm install && npm run build` → Load unpacked `extension/dist`
2. Perfect side panel → Linked to Cursor (green)
3. Permission mode: **Manual** (shows safety on camera)
4. Optional: Auto mode after first Allow site for a cleaner take

## Take A — 30s “hands in Chrome” (classic)

**Say:** “I gave Cursor hands in Chrome — Perfect, an open-source MCP bridge.”

**In Cursor, prompt:**

> Using Perfect browser tools: create a Perfect tab, go to https://example.com, snapshot the page, and tell me the main heading.

**Show on camera:**

1. Side panel pulses **Linked to Cursor**
2. Permission prompt → Allow once / Always allow site
3. Green **Perfect** tab group
4. Lime click ring + Stop HUD
5. Action HUD / agent tool calls: `navigate → snapshot`

**Close:** “Unofficial. Local-only. Repo + EVAL_FOR_CURSOR.md — `@cursor`.”

## Take B — YouTube search → play (v0.2 hero)

**Say:** “Same hands, real session — search YouTube and play a song.”

**In Cursor, prompt:**

> Using Perfect: search YouTube for “Saiyaara song”, open the official YRF title track, and play it.

**Show on camera:**

1. Perfect tab group opens YouTube results (or jumps to watch)
2. Official **Saiyaara Title Song | YRF** player visible
3. Press/`k` if needed — audio/video playing
4. Perfect + Stop HUD still visible bottom-right

**Close:** “v0.2 — Linked bridge, ~26 tools, real Chrome. github.com/Gtarafdar/perfect”

## Record a GIF / clip

1. CleanShot / Kap / QuickTime: capture the Perfect tab + a strip of Cursor tool calls
2. Export GIF or MP4 → drop as `docs/share/demo-youtube.gif` (or `.mp4`)
3. Optional: add to README under Status once the file is in the repo  
   `![Demo](docs/share/demo-youtube.gif)`

Keep under ~8 MB for GitHub README friendliness (or host MP4 and link).

## Do not

- Claim official Cursor product status
- Demo Skip mode or banking / checkout sites
- Paste tokens or secrets on stream
