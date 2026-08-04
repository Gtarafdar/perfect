import * as esbuild from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");

mkdirSync(dist, { recursive: true });
mkdirSync(join(dist, "icons"), { recursive: true });

await esbuild.build({
  entryPoints: [join(root, "src/background.ts"), join(root, "src/sidepanel.ts")],
  bundle: true,
  outdir: dist,
  format: "esm",
  target: "chrome120",
  sourcemap: true,
  logLevel: "info",
});

await esbuild.build({
  entryPoints: [join(root, "src/content.ts")],
  bundle: true,
  outfile: join(dist, "content.js"),
  format: "iife",
  target: "chrome120",
  sourcemap: true,
  logLevel: "info",
});

cpSync(join(root, "src/sidepanel.html"), join(dist, "sidepanel.html"));
cpSync(join(root, "src/sidepanel.css"), join(dist, "sidepanel.css"));
cpSync(join(root, "manifest.json"), join(dist, "manifest.json"));

for (const name of [
  "icon16.svg",
  "icon48.svg",
  "icon128.svg",
  "icon16.png",
  "icon48.png",
  "icon128.png",
]) {
  cpSync(join(root, "icons", name), join(dist, "icons", name));
}

console.log("Extension built → extension/dist");
