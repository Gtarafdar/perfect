# Eval for Cursor

**Perfect** is an unofficial open-source Chrome MV3 + MCP bridge so Cursor agents can drive a real logged-in Chrome session (navigate, snapshot, click, fill, screenshot) with Claude-style permission gates.

Not affiliated with Cursor / Anysphere.

## 5-minute try

```bash
git clone https://github.com/Gtarafdar/perfect.git
cd perfect && npm install && npm run build
```

1. Chrome → Load unpacked → `extension/dist`
2. Open Perfect side panel → **Copy connect for Cursor**
   - Under Advanced, set local `server.js` path to  
     `…/perfect/packages/mcp-server/dist/server.js` before copy (until npm publish)
3. Merge into `~/.cursor/mcp.json` (or paste **Copy chat prompt** into Cursor)
4. Enable **perfect** MCP → panel shows **Linked to Cursor**

In Cursor: “Using Perfect, open example.com and snapshot headings.”

## Architecture

Cursor (stdio MCP + `PERFECT_TOKEN` env) → `@perfect/mcp` → localhost WS → extension → `chrome.debugger` CDP → Perfect tab group.

## Security (read first)

See [SECURITY.md](./SECURITY.md) and [permissions.md](./permissions.md).

Extension-first pairing mints a CSPRNG token; MCP must present the same env token. We mirror Claude for Chrome’s Manual / Auto / Skip, site grants, protected + prohibited actions. We do **not** ship cloud ML classifiers — heuristics + human gates only.

## Why it’s interesting for Cursor

- Uses the user’s real profile (auth cookies) without Playwright’s blank profile
- MCP-native (fits Cursor’s tool loop today)
- One-click connect snippet from the extension (no Terminal required)
- Visible tab group + Stop HUD for trust

## Red-team in 10 minutes

1. Skip mode + checkout fixture → purchase must still hard-block
2. Injection fixture → snapshot flags / pause
3. Wrong `PERFECT_TOKEN` → no link
4. Regenerate token in panel → old mcp.json env fails until re-copy
5. `browser_evaluate` with `document.cookie` → prohibited

## Contact

GitHub issues / security advisories on this repo.
