# Manual smoke checklist

1. `npm install && npm run build`
2. Load unpacked `extension/dist` (Reload after every build)
3. **Welcome:** first install/update opens welcome once; reload Chrome without reopening welcome spam; CTAs open side panel / copy prompt
4. Side panel → **Copy setup prompt for Cursor** (npm `perfect-mcp`, GitHub fallback in prompt) → Linked
5. **Restart Perfect MCP** in Cursor after tool additions so schemas refresh
6. **Stop / Reconnect:** while Linked, Reconnect stays Linked (no tear-down); Stop cancels + HUD feedback
7. RoboForm: navigate fill-test → snapshot → fill first name → confirm cursor + value
8. WPBakery localhost inline editor → snapshot shows `frame:fN` → click in-frame control
9. Blog → extract or evaluate titles → screenshot
10. Cookie evaluate still denied; Pay now / Buy now stay prohibited
11. YouTube: search → open watch → `browser_press` `k` if needed (snapshot may be flaky)
12. `npm test` + `npm run test:e2e` + `npm run test:e2e:extension` green
13. `npm run pack:extension` → unzip list has welcome.* + no `.map` / secrets

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

## v0.2 CWS prep pass

| Check | Result |
|---|---|
| Welcome once / gate unit tests | pass (unit) |
| npm-default connect snippet + GitHub fallback | pass (unit) |
| Pack zip audit (welcome.*, no `.map`) | pass |
| Vitest unit+integration | 42 pass |
| Lint / typecheck | pass |
| Fixture / extension e2e | 21 + 1 pass |
| Lint / typecheck | pass |
| Stop/Reconnect Linked | prior fix; re-verify on load |
| YouTube search→play | see prior live smoke |

Signer: agent  Date: 2026-08-07
