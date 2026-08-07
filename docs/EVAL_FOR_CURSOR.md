# Eval for Cursor

**Perfect** is an unofficial open-source Chrome MV3 + MCP bridge so Cursor agents can drive a real logged-in Chrome session with Claude-style permission gates.

Not affiliated with Cursor / Anysphere.

**v0.2:** stable Linked reconnect, ~26 tools, live smokes including YouTube search→play. See [demo-script.md](./demo-script.md).

## 5-minute try (one prompt)

```bash
git clone https://github.com/Gtarafdar/perfect.git
cd perfect && npm install && npm run build
```

1. Chrome → Load unpacked → `extension/dist`
2. Perfect side panel → **Copy setup prompt for Cursor**
3. Paste into Cursor — agent merges `~/.cursor/mcp.json` (keeps other servers) and guides enable
4. Panel shows **Linked to Cursor**

For end users, the setup prompt uses `npx -y perfect-mcp` (GitHub fallback if unpublished). For local git builds, point MCP at `packages/mcp-server/dist/index.js` with `PERFECT_TOKEN`.

## Fun 30s prompt

> Using Perfect: search YouTube for “Saiyaara song”, open the official YRF title track, and play it.

## Architecture

Cursor (stdio MCP + `PERFECT_TOKEN`) → `perfect-mcp` → localhost WS → extension → CDP → Perfect tab group.

## Security

See [SECURITY.md](./SECURITY.md). Extension-first CSPRNG token; merge-only mcp.json; Manual/Auto/Skip; prohibited actions hard-blocked.

## Red-team

1. Checkout Buy now → prohibited while Linked  
2. Wrong token → no link  
3. Regenerate token → old env fails  
4. Paste setup prompt must not wipe other MCP servers  

## Contact

GitHub issues / security advisories on this repo.
