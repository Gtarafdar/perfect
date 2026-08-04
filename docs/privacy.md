# Privacy policy (Perfect)

**Last updated:** 2026-08-05

Perfect is a Chrome extension and local MCP server that lets AI agents (such as Cursor) control browser tabs you approve.

## Data we collect

Perfect does **not** operate a Perfect cloud backend in v1. Browsing data is not uploaded to Perfect servers.

- **On your machine:** bridge auth token, permission preferences, local audit log (`chrome.storage` / `~/.perfect`).
- **To Cursor:** tool results (snapshots, screenshots, page text) flow only through the local MCP connection you configure. Cursor’s own privacy policy applies to that processing.

## Permissions

The extension requests `debugger`, `tabs`, `tabGroups`, `scripting`, `storage`, `sidePanel`, and host access so it can navigate and interact with pages you allow. See store listing justifications.

## Contact

Open an issue on the GitHub repository.
