# Publishing `perfect-mcp` (optional)

**End users do not need this.** The Copy setup prompt installs from GitHub:

```text
npx -y --package=github:Gtarafdar/perfect perfect-mcp
```

The repo root exposes the `perfect-mcp` bin; the server dist is fully bundled (no nested `npm install`).

Optional registry publish (faster cold starts later):

```bash
cd packages/mcp-server
npm run build
npm login
npm publish --access public
```

Then switch the extension default connect mode from `github` to `npm` if desired.
