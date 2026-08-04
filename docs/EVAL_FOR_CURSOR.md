# Eval for Cursor

**Perfect** is an unofficial open-source Chrome MV3 + MCP bridge so Cursor agents can drive a real logged-in Chrome session with Claude-style permission gates.

Not affiliated with Cursor / Anysphere.

## 5-minute try (one prompt)

```bash
git clone https://github.com/Gtarafdar/perfect.git
cd perfect && npm install && npm run build
```

1. Chrome → Load unpacked → `extension/dist`
2. Perfect side panel → **Copy setup prompt for Cursor**
3. Paste into Cursor — agent merges `~/.cursor/mcp.json` (keeps other servers) and guides enable
4. Panel shows **Linked to Cursor**

Published MCP: `npx -y perfect-mcp` (with `PERFECT_TOKEN` env from the prompt).

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
