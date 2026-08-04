# Perfect

**Give Cursor hands in your Chrome.**

Unofficial open-source MCP bridge: Cursor agents navigate, click, fill, and screenshot in your **real** logged-in Chrome — with Claude-for-Chrome-style permission modes.

> Not affiliated with Cursor, Anysphere, or Anthropic.

[Security](docs/SECURITY.md) · [Eval for Cursor](docs/EVAL_FOR_CURSOR.md) · [Demo script](docs/demo-script.md) · [Share kit](docs/share/social-copy.md)

---

## Why

Cursor is great in the repo. Perfect gives it a controlled path into the browser you already use — same cookies, same session — via MCP.

```
Cursor  --MCP stdio-->  @perfect/mcp  --localhost WS + token-->  Chrome extension  --CDP-->  Perfect tab group
```

## Quick start

1. Install the Chrome extension
2. Open Perfect → **Copy setup prompt for Cursor**
3. Paste into Cursor — it merges MCP config and guides you
4. Enable **perfect** in Settings → MCP if asked → **Linked**

**End users never run `npm publish`.** The setup prompt installs the MCP from GitHub via `npx` (no local path, no registry publish required).

```bash
npm install && npm run build   # only for people developing Perfect itself
```

## Permission modes (default: Manual)

| Mode | Behavior |
|---|---|
| Manual | Approve actions (safest; best for demos) |
| Auto | Fewer prompts on trusted sites; protected still pauses |
| Skip | Dangerous; **prohibited actions still hard-block** |

Prohibited examples: Buy now / pay / permanent delete / cookie exfil via evaluate. See [docs/permissions.md](docs/permissions.md).

## Tools

`browser_status` `browser_tabs` `browser_navigate` `browser_snapshot` `browser_click` `browser_type` `browser_fill` `browser_press` `browser_scroll` `browser_screenshot` `browser_wait` `browser_evaluate` `browser_propose_plan` `browser_stop`

## Develop

```bash
npm run test:unit
npm run test:integration
npm run build
```

## Chrome Web Store

Pack with `npm run pack:extension`. See [docs/store-listing.md](docs/store-listing.md) and [docs/privacy.md](docs/privacy.md).

## License

MIT
