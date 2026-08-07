# Chrome Web Store listing — Perfect v0.2

## Claims freeze (do not overstate)

**Single purpose:** Connect a local MCP agent (for example Cursor) to control Chrome tabs the user approves.

| Claim | Allowed? |
|---|---|
| Local MCP bridge to real Chrome | Yes |
| Perfect tab group, Manual/Auto/Skip permissions, Stop | Yes |
| Listed tools only (~26) | Yes |
| Official Cursor / Anysphere / Google product | **No** |
| Cloud AI inside the extension | **No** |
| Remote code downloaded into the extension | **No** |
| Dedicated `browser_search` API | **No** (navigate + fill + click) |
| Guaranteed autoplay / snapshot on every site | **No** |

## Listing copy (paste into CWS)

**Name:** Perfect — Cursor Chrome Bridge

**Short description (≤132 chars):**
Give Cursor hands in your Chrome via a local MCP bridge. Unofficial open source — not affiliated with Cursor or Anysphere.

**Detailed description:**

Perfect is an unofficial open-source Chrome extension that pairs with a local MCP server so AI agents (such as Cursor) can navigate, click, fill, screenshot, and inspect tabs you approve — in your real browser session.

How it works:
1. Install this extension and open the Perfect side panel.
2. Copy the setup prompt into Cursor (or your MCP client).
3. When the panel shows Linked, the agent can use Perfect tools in a visible “Perfect” tab group.

Safety:
- Default permission mode is Manual (approve actions).
- Protected and prohibited action classes (for example checkout / Buy now) are gated or blocked.
- Emergency Stop cancels in-flight work and detaches the debugger.
- Bridge auth uses a local token; there is no Perfect cloud backend in v0.2.

Requirements:
- Node.js 20+ on your machine for the local MCP server (`npx` / npm).
- An MCP-capable client (Cursor recommended).

Not affiliated with Cursor, Anysphere, Google, or Anthropic.

**Category:** Developer Tools (or Productivity)

**Language:** English

## Permission justifications

| Permission | Justification |
|---|---|
| `debugger` | Chrome DevTools Protocol for trusted click/type/screenshot/upload/dialog handling in the user’s real session after approval |
| `tabs` | Create, list, navigate, focus, and close tabs used for agent tasks |
| `tabGroups` | Keep agent work in a visible “Perfect” tab group so the user can see what the agent is doing |
| `scripting` | Accessibility-style snapshots, form fills, and on-page HUD / cursor overlay |
| `storage` | Permission mode, allow/block lists, local audit log, welcome-seen flag, bridge token |
| `sidePanel` | Connection status, setup prompt, and permission prompts (not an in-extension chatbot) |
| `activeTab` | Support user-initiated panel flows |
| Host access `<all_urls>` | Agent navigates to user-requested sites; origins cannot be fixed in advance |

## Remote code

No. All extension code ships inside the store package.

## Data safety (questionnaire hints)

- Perfect does not operate a Perfect cloud backend in v0.2.
- Token, preferences, and audit log stay on the device (`chrome.storage` / local MCP config).
- Snapshots, screenshots, and page text are returned only over the user’s local MCP connection to their configured client (e.g. Cursor). That client’s privacy policy applies to further processing.
- No sale of personal data by Perfect.

## Privacy policy URL

Host at **https://gtarafdar.github.io/perfect/privacy.html** (also [`docs/privacy.md`](../privacy.md)). Paste that URL into CWS.

## Disclaimer

Not affiliated with Cursor, Anysphere, Google, or Anthropic.
