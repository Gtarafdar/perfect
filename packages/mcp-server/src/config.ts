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

/** Minimum accepted token length in hex chars (16 bytes). Prefer 48+ from mint. */
export const MIN_TOKEN_HEX_LEN = 32;
export const PREFERRED_TOKEN_BYTES = 24;

export function configDir(): string {
  return join(homedir(), ".perfect");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function mintTokenHex(bytes = PREFERRED_TOKEN_BYTES): string {
  return randomBytes(bytes).toString("hex");
}

export function assertTokenStrength(token: string): void {
  if (!token || token.trim().length < MIN_TOKEN_HEX_LEN) {
    throw new Error(
      `PERFECT_TOKEN is missing or too short (need ≥${MIN_TOKEN_HEX_LEN} hex chars)`,
    );
  }
}

export function parseWsPort(raw: string | undefined, fallback = DEFAULT_WS_PORT): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback;
  return n;
}

/**
 * Resolve config with security-first precedence:
 * 1. PERFECT_TOKEN / PERFECT_WS_PORT env (extension-first pairing)
 * 2. ~/.perfect/config.json
 * 3. Create new file config
 *
 * When env token is set, it wins and the file is not overwritten with a different token.
 */
export function loadOrCreateConfig(
  env: NodeJS.ProcessEnv = process.env,
): PerfectConfig {
  const envToken = env.PERFECT_TOKEN?.trim();
  const envPort = parseWsPort(env.PERFECT_WS_PORT);

  if (envToken) {
    assertTokenStrength(envToken);
    return {
      token: envToken,
      wsPort: envPort,
    };
  }

  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const path = configPath();
  if (existsSync(path)) {
    const file = JSON.parse(readFileSync(path, "utf8")) as PerfectConfig;
    assertTokenStrength(file.token);
    return {
      token: file.token,
      wsPort: file.wsPort || DEFAULT_WS_PORT,
      extensionId: file.extensionId,
    };
  }

  const cfg: PerfectConfig = {
    token: mintTokenHex(),
    wsPort: DEFAULT_WS_PORT,
  };
  writeFileSync(path, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  return cfg;
}

export function saveConfig(cfg: PerfectConfig): void {
  assertTokenStrength(cfg.token);
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
}
