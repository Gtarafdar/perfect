# Publishing `perfect-mcp`

**End users need both:** the Chrome extension (CWS or Load unpacked) **and** the local MCP server. CWS install ≠ MCP install.

## Default (npm)

After `perfect-mcp` is on the registry, the extension **Copy setup prompt** merges:

```text
npx -y perfect-mcp
```

with `PERFECT_TOKEN` / `PERFECT_WS_PORT` in env.

## Fallback (GitHub)

If npm 404s or the package is unpublished, the setup prompt includes this fallback:

```text
npx -y --package=github:Gtarafdar/perfect perfect-mcp
```

The repo root exposes the `perfect-mcp` bin; the server dist is fully bundled (no nested `npm install`).

## Publisher steps

```bash
cd packages/mcp-server
npm run build
npm login
npm publish --access public
```

Verify cold start:

```bash
npx -y perfect-mcp --help
# or run via Cursor MCP with a test token and confirm Linked
```

Bump versions together with the extension (`0.2.0`+) so CWS and npm stay aligned.
