import { rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "extension", "dist");
const out = join(root, "perfect-extension.zip");

rmSync(out, { force: true });
execSync(`cd "${dist}" && zip -r "${out}" . -x "*.map"`, { stdio: "inherit" });
console.log("Wrote", out);
