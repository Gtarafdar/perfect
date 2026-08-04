# Perfect capability report

Generated: 2026-08-04T21:54:14.322Z

## Summary

| Status | Count |
|---|---|
| Working | 14 |
| Not working | 0 |
| Skipped | 0 |

## Working

- **Form fill fields present** (`browser_fill`) — ok
- **Modal open dismiss** (`browser_click`) — ok
- **Hover opens menu** (`browser_hover`) — ok
- **Same-origin iframe pierce** (`browser_snapshot`) — ok
- **Flip box toggle** (`browser_click`) — ok
- **Scrape article links table** (`browser_extract`) — ok
- **Wait for selector pattern** (`browser_wait`) — ok
- **Cookie evaluate prohibited** (`browser_evaluate`) — ok
- **Screenshot protected** (`browser_screenshot`) — ok
- **Console protected** (`browser_console`) — ok
- **Buy now click prohibited** (`browser_click`) — ok
- **Hover normal is low** (`browser_hover`) — ok
- **Extract is low** (`browser_extract`) — ok
- **Stamp refs across iframe** (`browser_snapshot`) — ok

## Not working

_none_

## Improve next

_No P0 failures from this automated run._

## Full matrix

| Capability | Tool | Status | Notes | Improve next |
|---|---|---|---|---|
| Form fill fields present | `browser_fill` | pass | ok |  |
| Modal open dismiss | `browser_click` | pass | ok |  |
| Hover opens menu | `browser_hover` | pass | ok |  |
| Same-origin iframe pierce | `browser_snapshot` | pass | ok |  |
| Flip box toggle | `browser_click` | pass | ok |  |
| Scrape article links table | `browser_extract` | pass | ok |  |
| Wait for selector pattern | `browser_wait` | pass | ok |  |
| Cookie evaluate prohibited | `browser_evaluate` | pass | ok |  |
| Screenshot protected | `browser_screenshot` | pass | ok |  |
| Console protected | `browser_console` | pass | ok |  |
| Buy now click prohibited | `browser_click` | pass | ok |  |
| Hover normal is low | `browser_hover` | pass | ok |  |
| Extract is low | `browser_extract` | pass | ok |  |
| Stamp refs across iframe | `browser_snapshot` | pass | ok |  |

## Manual / agent smoke (fill after live runs)

| Capability | Status | Notes |
|---|---|---|
| RoboForm fill + visible cursor | pending | Run via Perfect MCP on www.roboform.com |
| WPBakery iframe Add Element | pending | localhost:8893 frontend editor |
| Blog research extract + annotate | pending | wpbakery.com/blog |

## Regression locks

See [baseline-regression.md](./baseline-regression.md). Vitest must stay green.
