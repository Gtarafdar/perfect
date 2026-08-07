# CWS submit runbook (human)

Agent prepares code/docs/zip. You perform account + upload.

## Before submit

1. [ ] `npm test` + `npm run test:e2e` + `npm run test:e2e:extension` + `npm run lint` green
2. [ ] `npm run pack:extension` → `perfect-extension.zip` (no `.map`, no secrets)
3. [ ] Privacy policy published at public HTTPS URL — https://gtarafdar.github.io/perfect/privacy.html ; link in listing + welcome
4. [ ] Screenshots captured per [`ASSETS.md`](./ASSETS.md)
5. [ ] Listing text from [`docs/store-listing.md`](../store-listing.md) — no overclaims
6. [ ] Optional: `npm publish` for `perfect-mcp@0.2.0` (see [`docs/publish-npm.md`](../publish-npm.md))

## Console fields

| Field | Value |
|---|---|
| Item name | Perfect — Cursor Chrome Bridge |
| Summary | from store-listing short description |
| Description | from store-listing detailed description |
| Category | Developer Tools |
| Language | English |
| Privacy policy URL | your hosted URL |
| Single purpose | Connect a local MCP agent to control Chrome tabs the user approves |

## After submit

- Do not change production behavior without a new version code while under review.
- Keep Load-unpacked / GitHub install for contributors.
- Reply to reviewer questions using [`review-replies.md`](./review-replies.md).

## Scale note

Extension updates = Chrome Web Store. MCP install = each user’s `npx` (npm preferred). No Perfect cloud server on your machine.
