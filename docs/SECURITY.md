# Security

Perfect is a **local** Cursor ↔ Chrome bridge. The agent brain lives in Cursor; the extension executes browser tools. Page content is **untrusted**.

## Pairing (extension-first)

On first open, the extension mints a **CSPRNG** bridge token (≥24 bytes) and stores it in `chrome.storage.local`.

**Happy path:** **Copy connect for Cursor** puts that token into MCP `env.PERFECT_TOKEN` (and port). Cursor starts `@perfect/mcp` with that env; the extension connects over `ws://127.0.0.1` and must present the same token in `hello`.

- Env token **wins** over `~/.perfect/config.json`.
- Short / empty tokens are rejected at MCP startup.
- Regenerating the token in the panel invalidates old MCP env until you copy again.
- Perfect does **not** upload the token anywhere.

### Residual pairing risks

Anyone with local access to `~/.cursor/mcp.json` (or your clipboard right after copy) can run the MCP server with your token and drive the bridge — same class of risk as a local API key or the older `~/.perfect/token.txt` flow. Keep mcp.json permissions private; regenerate if leaked.

## Threat model

| Threat | Mitigation |
|---|---|
| Prompt injection in page/DOM | Heuristic scan on snapshots; Manual mode default; pause on hits |
| Malicious local process | Auth token; WebSocket bound to `127.0.0.1` only |
| Cookie theft via evaluate | `document.cookie` / storage access **prohibited** |
| Tab hijacking | Actions target Perfect tab group (claimed tabs) by default |
| Debugger left attached | Detach on stop / disconnect |
| Purchases / permanent deletes | Hard **prohibited** classifiers before CDP |
| Weak / missing bridge token | Min length enforced; CSPRNG mint; no open mode |

## Claude for Chrome mapping

Perfect intentionally mirrors Claude’s public permission model:

- Modes: **Manual** (default) / **Auto** / **Skip**
- Per-site Allow once / Always allow / Deny
- Protected actions (downloads, sensitive fields) still confirm
- Prohibited actions never run (purchases, account create, trades, etc.)

**Gap:** Claude ships trained cloud safety classifiers. Perfect v1 uses **deterministic gates + heuristics + human approval** only.

## Residual risks

- Screenshots and snapshots can include sensitive on-screen data and flow into Cursor’s context.
- Heuristics can false-negative. Never use Skip mode on important accounts.
- Prefer a separate Chrome profile without banking/email when experimenting.
- This project is **not** affiliated with Cursor, Anysphere, or Anthropic.

## Reporting

Open a GitHub Security Advisory or private report on the repository. Do not file public issues for exploitable bugs until patched.
