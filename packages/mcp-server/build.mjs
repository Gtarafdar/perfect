import * as esbuild from "esbuild";
import { chmodSync, rmSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await esbuild.build({
  entryPoints: {
    index: join(root, "src/index.ts"),
    server: join(root, "src/server.ts"),
    cli: join(root, "src/cli.ts"),
    host: join(root, "src/host.ts"),
  },
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outdir: dist,
  // Keep Node deps external — root package.json lists them so
  // `npx github:Gtarafdar/perfect perfect-mcp` installs them once.
  // (Fully bundling ws into ESM hits Dynamic require of "events".)
  external: [
    "@modelcontextprotocol/sdk",
    "@modelcontextprotocol/sdk/*",
    "ws",
    "zod",
  ],
  banner: {
    js: "#!/usr/bin/env node\n",
  },
  sourcemap: true,
  logLevel: "info",
});

for (const f of ["index.js", "server.js", "cli.js", "host.js"]) {
  chmodSync(join(dist, f), 0o755);
}

console.log("perfect-mcp bundled → dist/ (protocol inlined)");
