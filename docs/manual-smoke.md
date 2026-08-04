# Manual smoke checklist

Run before every release or store upload.

1. `npm install && npm run build`
2. Chrome → `chrome://extensions` → Load unpacked → `extension/dist`
3. Open Perfect side panel — confirm token was auto-created (no Terminal); status **Waiting for Cursor MCP**
4. Advanced → set local `server.js` path (git builds) → **Copy connect for Cursor** → merge `~/.cursor/mcp.json`
5. Enable Perfect MCP in Cursor → panel shows **Linked to Cursor**
6. Optionally test **Copy chat prompt** on a clean machine once
7. In Cursor: list tabs / navigate example.com / snapshot
8. Confirm Perfect tab group, on-page HUD + Stop
9. **Regenerate token** → Linked drops / old config fails → re-copy → Linked again
10. Checkout fixture → Buy now **prohibited** while Linked
11. Injection fixture → flags / protected pause
12. Disconnect MCP → Waiting; reconnect works
13. Debugger banner only while attached (briefly)

Signer: __________  Date: __________
