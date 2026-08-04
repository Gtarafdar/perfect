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

```bash
npm install
npm run build
```

1. Chrome → `chrome://extensions` → **Load unpacked** → select `extension/dist`
2. Copy the extension ID
3. Register + print Cursor config:

```bash
node packages/mcp-server/dist/cli.js install --extension-id <id>
```

4. Paste the token into the Perfect side panel → **Link**
5. Add the printed snippet to `~/.cursor/mcp.json` and enable the MCP server
6. In Cursor: *“Using Perfect, open https://example.com and snapshot the headings.”*

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
