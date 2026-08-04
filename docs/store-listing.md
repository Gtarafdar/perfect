# Chrome Web Store listing notes

## Single purpose

Connect a local MCP agent (e.g. Cursor) to control Chrome tabs the user approves.

## Permission justifications

| Permission | Justification |
|---|---|
| `debugger` | Chrome DevTools Protocol for trusted click/type/screenshot in the user’s real session |
| `tabs` | Create/list/navigate tabs for agent tasks |
| `tabGroups` | Keep agent work in a visible “Perfect” tab group |
| `scripting` | Accessibility-style snapshots and HUD overlay |
| `storage` | Permission mode, allow/block lists, audit log |
| `sidePanel` | Connection status and permission prompts (not a chatbot) |
| `activeTab` / host access | Act on user-approved sites the agent navigates to |

## Remote code

No. All extension code ships in the package.

## Disclaimer

Not affiliated with Cursor, Anysphere, Google, or Anthropic.
