# Baseline regression locks (pre-capability expansion)

Captured after commit `15fdedd` (Linked fills / content-script cursor / page scripting).

## Vitest

```
npm test → 25 passed (4 files)
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
| Protocol | Existing 15 `ToolName`s keep non-breaking `ok`/`result` shapes |

## Existing tools (regression matrix)

`browser_status`, `browser_tabs`, `browser_navigate`, `browser_back`, `browser_forward`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_fill`, `browser_press`, `browser_scroll`, `browser_screenshot`, `browser_wait`, `browser_evaluate`, `browser_propose_plan`, `browser_stop`
