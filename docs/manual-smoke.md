# Manual smoke checklist

1. `npm install && npm run build`
2. Load unpacked `extension/dist`
3. Side panel shows one primary button: **Copy setup prompt for Cursor**
4. Paste prompt into Cursor → mcp.json merges without wiping other servers
5. Enable perfect MCP → **Linked**
6. No Advanced path required when `perfect-mcp` is published
7. Force EADDRINUSE (second MCP) → clear error mentioning free the port
8. Regenerate token → re-copy prompt → Linked again
9. Checkout fixture still prohibited
10. `browser_status` works from Cursor

Signer: __________  Date: __________
