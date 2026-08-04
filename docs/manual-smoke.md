# Manual smoke checklist

1. `npm install && npm run build`
2. Load unpacked `extension/dist` (Reload after every build)
3. Side panel → **Copy setup prompt for Cursor** → Linked
4. **Restart Perfect MCP** in Cursor after tool additions so schemas refresh
5. RoboForm: navigate fill-test → snapshot → fill first name → confirm cursor + value
6. WPBakery localhost inline editor → snapshot shows `frame:fN` → click in-frame control
7. Blog → extract or evaluate titles → screenshot
8. Cookie evaluate still denied
9. `npm test` + `npm run test:e2e` + `npm run test:e2e:extension` green

## Completion pass results (2026-08-05)

| Check | Result |
|---|---|
| RoboForm fill | pass |
| WPBakery iframe click | pass (`frame:f1`) |
| Blog screenshot + titles | pass |
| Linked after multi-tab | pass (3 claimed tabs) |
| Fixture E2E | 21 pass |
| Extension E2E | 1 pass |
| Vitest | 31 pass |

Signer: agent  Date: 2026-08-05
