# Privacy policy (Perfect)

**Last updated:** 2026-08-07

Perfect is a Chrome extension and local MCP server that lets AI agents (such as Cursor) control browser tabs you approve.

## Data we collect

Perfect does **not** operate a Perfect cloud backend in v0.2. Browsing data is not uploaded to Perfect servers.

- **On your machine:** bridge auth token, permission preferences, welcome-seen flag, local audit log (`chrome.storage` / local MCP config).
- **To your MCP client (e.g. Cursor):** tool results (snapshots, screenshots, page text) flow only through the local MCP connection you configure. That client’s privacy policy applies to that processing.

## Permissions

The extension requests `debugger`, `tabs`, `tabGroups`, `scripting`, `storage`, `sidePanel`, and host access so it can navigate and interact with pages you allow. See Chrome Web Store listing justifications.

## Contact

Open an issue on the GitHub repository: https://github.com/Gtarafdar/perfect

For security-sensitive reports, prefer a private GitHub security advisory on that repository.
