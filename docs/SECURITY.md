# Security

Perfect is a **local** Cursor ↔ Chrome bridge. The agent brain lives in Cursor; the extension executes browser tools. Page content is **untrusted**.

## Threat model

| Threat | Mitigation |
|---|---|
| Prompt injection in page/DOM | Heuristic scan on snapshots; Manual mode default; pause on hits |
| Malicious local process | Auth token; WebSocket bound to `127.0.0.1` only |
| Cookie theft via evaluate | `document.cookie` / storage access **prohibited** |
| Tab hijacking | Actions target Perfect tab group (claimed tabs) by default |
| Debugger left attached | Detach on stop / disconnect |
| Purchases / permanent deletes | Hard **prohibited** classifiers before CDP |

## Claude for Chrome mapping

Perfect intentionally mirrors Claude’s public permission model:

- Modes: **Manual** (default) / **Auto** / **Skip**
- Per-site Allow once / Always allow / Deny
- Protected actions (downloads, sensitive fields) still confirm
- Prohibited actions never run (purchases, account create, trades, etc.)

**Gap:** Claude ships trained cloud safety classifiers. Perfect v1 uses **deterministic gates + heuristics + human approval** only. We document this honestly for evaluators.

## Residual risks

- Screenshots and snapshots can include sensitive on-screen data and flow into Cursor’s context.
- Heuristics can false-negative. Never use Skip mode on important accounts.
- Prefer a separate Chrome profile without banking/email when experimenting.
- This project is **not** affiliated with Cursor, Anysphere, or Anthropic.

## Reporting

Open a GitHub Security Advisory or private report on the repository. Do not file public issues for exploitable bugs until patched.
