# Perfect capability report

Generated: 2026-08-04T22:15:00.000Z (completion pass)

## Summary

| Status | Count |
|---|---|
| Working (fixture E2E) | 21 |
| Working (extension+MCP E2E) | 1 suite |
| Working (live smoke) | 3 |
| Not working | 0 (P0) |
| Skipped | 0 |

## Working

### Automated fixtures (`npm run test:e2e`)

- Form fill, modal, hover, iframe pierce, flip, scrape, wait
- Security: cookie evaluate prohibited; screenshot/console/upload/network protected; drag low
- Completion: drag drop, file input, dialogs, network JSON

### Extension + MCP (`npm run test:e2e:extension`)

- Launch Chromium with `extension/dist`, seed token, Linked on port 17329
- `browser_status` → navigate form → snapshot → fill → cookie evaluate blocked → extract

### Live agent smoke (Perfect group)

| Capability | Status | Notes |
|---|---|---|
| RoboForm fill + visible cursor | **pass** | Filled `02frstname` = PerfectSmoke on filling-test-all-fields; Linked stayed up |
| WPBakery iframe Add Element path | **pass** | Snapshot showed `frame:f1` same-origin; clicked `Start building` (ref e30, frame f1) with cursor |
| Blog research extract + screenshot | **pass** | Titles/links via evaluate (Cursor MCP schema not yet refreshed for `browser_extract`); screenshot captured blog + Perfect HUD |

## Not working

_none P0_

## Improve next

1. **Restart Perfect MCP in Cursor** so new tools appear (`browser_extract`, `browser_drag`, `browser_upload`, `browser_network`, `browser_handle_dialog`, `browser_hover`, …). Extension already returns `frames` / `mode` on snapshot.
2. Annotated screenshot (`refs`/`labels`) once MCP schema reloads.
3. Optional later: clipboard / PDF (deferred intentionally).

## Full matrix (new tools)

| Capability | Tool | Status | Notes |
|---|---|---|---|
| Drag/drop | `browser_drag` | pass (fixture + unit) | Live optional |
| File upload | `browser_upload` | pass (fixture + unit + protected) | Absolute paths only |
| Network log | `browser_network` | pass (fixture + unit + protected) | Read-only |
| JS dialogs | `browser_handle_dialog` | pass (fixture + unit) | alert/confirm/prompt |
| Extension bridge E2E | status/nav/snap/fill | pass | `test:e2e:extension` |

## Regression locks

See [baseline-regression.md](./baseline-regression.md). Vitest **31** passed; fixture E2E **21** passed; extension E2E **1** passed.
