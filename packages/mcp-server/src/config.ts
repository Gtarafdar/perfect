import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { DEFAULT_WS_PORT } from "@perfect/protocol";

export interface PerfectConfig {
  token: string;
  wsPort: number;
  extensionId?: string;
}

export function configDir(): string {
  return join(homedir(), ".perfect");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function loadOrCreateConfig(): PerfectConfig {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const path = configPath();
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf8")) as PerfectConfig;
  }
  const cfg: PerfectConfig = {
    token: randomBytes(24).toString("hex"),
    wsPort: DEFAULT_WS_PORT,
  };
  writeFileSync(path, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  return cfg;
}

export function saveConfig(cfg: PerfectConfig): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
}
