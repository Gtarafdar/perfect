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

1. Install the Chrome extension (Store, or Load unpacked → `extension/dist` after `npm run build`)
2. Open the Perfect side panel — a bridge token is **minted automatically**
3. Click **Copy connect for Cursor** (or **Copy chat prompt** and paste into Cursor to merge config)
4. Enable the **perfect** MCP in Cursor Settings → MCP
5. Wait until the panel shows **Linked to Cursor**
6. Ask Cursor: *“Using Perfect, open https://example.com and snapshot the headings.”*

The token lives in extension storage and in your local `mcp.json` `env` — not a Cursor account password. See [docs/SECURITY.md](docs/SECURITY.md).

```bash
npm install && npm run build   # developers building from source
```

**Advanced / CLI:** `node packages/mcp-server/dist/cli.js setup` still works. For local git builds, set the optional server.js path under Advanced before copying connect.

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
