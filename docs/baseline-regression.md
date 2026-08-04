# Baseline regression locks

Updated after capability expansion (`5864597`). Before completion-pass tools: **22** `ToolName`s.

## Vitest

```
npm test → 28 passed (4 files)
```

- `tests/unit/security.test.ts`
- `tests/unit/pairing.test.ts`
- `tests/integration/bridge.test.ts`
- `tests/integration/pairing.test.ts`

## Must stay green

| Lock | Behavior |
|---|---|
| Linked stability | Skip reconnect if WS already OPEN/CONNECTING; no side-panel flash loop |
| Fill path | `typeIntoRef` first; `nativeFill` fallback; content-script cursor animate |
| Scripting path | DOM via `chrome.scripting` / `page.ts` — no foreign-extension CDP frames |
| Security | cookie/storage evaluate prohibited; Manual/Auto/Skip; Perfect group tabs |
| Protocol | Existing tool shapes stay non-breaking; only **add** tools/args |

## Core tools (must not break)

`browser_status`, `browser_tabs`, `browser_navigate`, `browser_back`, `browser_forward`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_fill`, `browser_press`, `browser_scroll`, `browser_screenshot`, `browser_wait`, `browser_evaluate`, `browser_propose_plan`, `browser_stop`, `browser_extract`, `browser_console`, `browser_hover`, `browser_select`, `browser_tab_close`, `browser_tab_focus`

## Fixture E2E

```
npm run test:e2e → 14 passed
```
