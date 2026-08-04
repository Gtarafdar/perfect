# Publishing `perfect-mcp`

One-prompt connect needs `npx -y perfect-mcp` on npm.

```bash
cd packages/mcp-server
npm run build
npm login          # once
npm publish --access public
```

Package is unscoped (`perfect-mcp`), protocol is bundled into `dist/`, runtime deps are `@modelcontextprotocol/sdk`, `ws`, `zod`.
