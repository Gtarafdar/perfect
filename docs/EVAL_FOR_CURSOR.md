# Eval for Cursor

**Perfect** is an unofficial open-source Chrome MV3 + MCP bridge so Cursor agents can drive a real logged-in Chrome session (navigate, snapshot, click, fill, screenshot) with Claude-style permission gates.

Not affiliated with Cursor / Anysphere.

## 5-minute try

```bash
git clone https://github.com/Gtarafdar/perfect.git
cd perfect && npm install && npm run build
# Chrome → Load unpacked → extension/dist
node packages/mcp-server/dist/cli.js install --extension-id <id>
# Add printed mcp.json snippet; paste token in side panel
```

In Cursor: “Using Perfect, open example.com and snapshot headings.”

## Architecture

Cursor (stdio MCP) → `@perfect/mcp` (localhost WS + token) → extension service worker → `chrome.debugger` CDP → Perfect tab group.

## Security (read first)

See [SECURITY.md](./SECURITY.md) and [permissions.md](./permissions.md).

We mirror Claude for Chrome’s Manual / Auto / Skip, site grants, protected + prohibited actions. We do **not** ship cloud ML classifiers — heuristics + human gates only.

## Why it’s interesting for Cursor

- Uses the user’s real profile (auth cookies) without Playwright’s blank profile
- MCP-native (fits Cursor’s tool loop today)
- Visible tab group + Stop HUD for trust
- Store-oriented packaging path for distribution

## Red-team in 10 minutes

1. Skip mode + checkout fixture → purchase must still hard-block
2. Injection fixture → snapshot flags / pause
3. Wrong bridge token → no link
4. `browser_evaluate` with `document.cookie` → prohibited

## Contact

GitHub issues / security advisories on this repo.
