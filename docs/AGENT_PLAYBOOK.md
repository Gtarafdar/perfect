# Agent playbook — using Perfect from Cursor

Perfect gives Cursor hands in real Chrome. Prefer **visible cursor tools** over silent `browser_evaluate`.

## Research a page

1. `browser_navigate` → URL (reuse returned `tabId`)
2. `browser_snapshot` with `mode: "text"` for readable body, or `browser_extract` for links/tables
3. `browser_screenshot` with `refs` + `labels` when you need annotated evidence for a doc
4. Write markdown notes in the repo from extract + captions — Perfect supplies evidence only

## Search & play media (YouTube)

There is no dedicated `browser_search` tool — chain the browser tools.

1. `browser_navigate` to a search URL, e.g. `https://www.youtube.com/results?search_query=saiyaara+song` (reuse `tabId`)
2. `browser_wait` a few seconds; `browser_screenshot` if snapshot is flaky on heavy SPAs
3. Prefer opening a known watch URL when the top result is clear: `browser_navigate` → `https://www.youtube.com/watch?v=…`
4. `browser_press` `k` (YouTube play/pause) or Space if autoplay is blocked
5. Confirm with `browser_screenshot`

**Live smoke (v0.2):** “saiyara” → official YRF *Saiyaara Title Song* (`BSJa1UytM8w`) played in the Perfect tab group.

On script-heavy sites (YouTube), snapshot/evaluate can fail; navigate + wait + screenshot + keyboard still works.

## Fix / debug UI

1. Snapshot (`full` if modals/menus matter)
2. `browser_hover` to open menus / reveal flip panels
3. `browser_click` / `browser_fill` / `browser_select` with cursor
4. `browser_wait` with `selector` instead of long sleeps
5. `browser_console` if the page logs errors (protected)

## Builders (WPBakery / iframes)

1. Snapshot — look for `frame:fN` on actions and `frames[].sameOrigin`
2. Click/fill refs that live in same-origin iframes (no silent evaluate unless required)
3. Put lasting CSS in **Custom Code → CSS**, not a temporary injected `<style>`

## Drag, upload, network, dialogs

| Need | Tool | Notes |
|---|---|---|
| Drag card / item | `browser_drag` | `fromRef` + `toRef` after snapshot (includes `[draggable=true]`) |
| File input | `browser_upload` | Absolute `path` / `paths`; protected; claimed tab |
| See requests | `browser_network` | Read-only log; redacts sensitive query params |
| alert/confirm/prompt | `browser_handle_dialog` | `accept` + optional `promptText`; arm before the click that opens it |

## When scripts fail

Use `browser_extract` / `mode: "text"` snapshot. Do **not** reach for `document.cookie` / storage (prohibited).

## Tab hygiene

- Reuse `tabId`; `newTab: true` only when needed
- `browser_tab_focus` / `browser_tab_close` only for **claimed** Perfect-group tabs

## Security

Manual mode by default. Screenshots/console/network/annotations/uploads can include PII. See [SECURITY.md](./SECURITY.md).
