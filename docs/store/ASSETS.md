# Store assets checklist (Perfect v0.2)

Capture from a real Linked build. Store under `docs/store/assets/` (PNG). Do not commit secrets.

## Required for CWS

| File | Size | Content |
|---|---|---|
| `icon-128.png` | 128×128 | Brand mark (can copy `extension/icons/icon128.png`) |
| `screenshot-01-linked.png` | 1280×800 | Side panel **Linked to Cursor**, Manual mode |
| `screenshot-02-permission.png` | 1280×800 | Permission prompt (Allow once / Always allow site / Deny) |
| `screenshot-03-tabs-hud.png` | 1280×800 | Perfect tab group + on-page Perfect/Stop HUD |
| `screenshot-04-setup.png` | 1280×800 | Welcome page or side panel “Copy setup prompt” |
| `screenshot-05-demo.png` | 1280×800 | Optional: YouTube / example.com agent task |

Also accepted: 640×400 screenshots (use consistently).

## Optional promo

| File | Size |
|---|---|
| `promo-small.png` | 440×280 |
| `promo-marquee.png` | 1400×560 |

## Demo motion (optional README)

| File | Notes |
|---|---|
| `demo-youtube.gif` or `.mp4` | From [`docs/demo-script.md`](../demo-script.md) Take B; keep GIF under ~8 MB |

## Capture steps

1. `npm run build` → Load unpacked `extension/dist` → reload extension.
2. Open welcome (or reinstall once) and side panel.
3. Use a clean Chrome window; hide bookmarks bar if cluttered.
4. Export PNG at exact pixel sizes (CleanShot / macOS Screenshot → resize).
5. Redact any personal emails, tokens, or private tabs before commit/upload.

## Status

- [ ] icon-128
- [ ] screenshot-01-linked
- [ ] screenshot-02-permission
- [ ] screenshot-03-tabs-hud
- [ ] screenshot-04-setup
- [ ] privacy policy HTTPS URL live
- [ ] zip from `npm run pack:extension` audited
