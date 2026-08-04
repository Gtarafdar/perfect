# Perfect

**Give Cursor hands in your Chrome.**

Unofficial open-source MCP bridge: Cursor agents navigate, click, fill, screenshot, extract, and inspect real Chrome — with Claude-for-Chrome-style permission modes.

> Not affiliated with Cursor, Anysphere, or Anthropic.

**Status: v0.2 ready** — Linked bridge is stable, ~26 tools, live smoke (forms, builders, YouTube search→play). See [demo script](docs/demo-script.md) · [agent playbook](docs/AGENT_PLAYBOOK.md).

[Security](docs/SECURITY.md) · [Capability report](docs/capability-report.md) · [Eval for Cursor](docs/EVAL_FOR_CURSOR.md) · [Share kit](docs/share/social-copy.md)

---

## Why

Cursor is great in the repo. Perfect gives it a controlled path into the browser you already use — same cookies, same session — via MCP.

```
Cursor  --MCP stdio-->  @perfect/mcp  --localhost WS + token-->  Chrome extension  --scripting/CDP-->  Perfect tab group
```

## Quick start

1. Install the Chrome extension (`extension/dist` after `npm run build`)
2. Open Perfect → **Copy setup prompt for Cursor**
3. Paste into Cursor — it merges MCP config and guides you
4. Enable **perfect** in Settings → MCP if asked → **Linked**

## Try this prompt

> Using Perfect: search YouTube for “Saiyaara song”, open the official YRF title track, and play it.

Agent pattern: `browser_navigate` (search or watch URL) → `browser_wait` / screenshot → `browser_press` `k` if needed. Full recipes in the [playbook](docs/AGENT_PLAYBOOK.md#search--play-media-youtube).

## Permission modes (default: Manual)

| Mode | Behavior |
|---|---|
| Manual | Approve actions (safest) |
| Auto | Fewer prompts on trusted sites; protected still pauses |
| Skip | Dangerous; **prohibited actions still hard-block** |

## Capability matrix

| Area | Tools |
|---|---|
| Tabs | `browser_status` `browser_tabs` `browser_navigate` `browser_back` `browser_forward` `browser_tab_focus` `browser_tab_close` |
| Read | `browser_snapshot` (compact/full/text, iframes) `browser_extract` `browser_console` `browser_network` `browser_wait` |
| Act | `browser_click` `browser_hover` `browser_drag` `browser_fill` `browser_type` `browser_select` `browser_upload` `browser_press` `browser_scroll` `browser_handle_dialog` |
| See | `browser_screenshot` (annotations, fullPage, clip) |
| Guarded | `browser_evaluate` `browser_propose_plan` `browser_stop` |

See [Agent playbook](docs/AGENT_PLAYBOOK.md) for research / media / WPBakery / scrape workflows.

## Develop

```bash
npm install && npm run build
npm test                      # Vitest unit + integration
npm run test:e2e              # Playwright fixtures → docs/capability-report.md
npm run test:e2e:extension    # Chromium + unpacked extension + MCP WS bridge
npm run test:e2e:all          # fixtures + extension
```

## Chrome Web Store

Pack with `npm run pack:extension`. Icons are PNG 16/48/128 (SVG sources kept).

## License

MIT
