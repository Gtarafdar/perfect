# Manual smoke checklist

Run before every release or store upload.

1. `npm install && npm run build`
2. Chrome → `chrome://extensions` → Load unpacked → `extension/dist`
3. Copy extension ID → `node packages/mcp-server/dist/cli.js install --extension-id <id>`
4. Paste token into Perfect side panel → Link
5. Add MCP config from CLI output to `~/.cursor/mcp.json` → restart Cursor MCP
6. In Cursor: list tabs with Perfect → navigate to https://example.com → snapshot
7. Confirm Perfect tab group appears (green / “Perfect”)
8. Confirm on-page HUD + Stop works
9. Open `tests/fixtures/checkout.html` via file URL or local server → click Buy now must be **prohibited** or require deny path
10. Open injection fixture → snapshot should surface injection flags / protected pause
11. Disconnect MCP → panel shows Waiting; reconnect works
12. Debugger banner appears only while attached (briefly)

Signer: __________  Date: __________
