import { describe, expect, it } from "vitest";
import {
  assertTokenHex,
  buildChatPrompt,
  buildConnectJson,
  buildMcpServerEntry,
  mintTokenHex as mintExt,
  MIN_TOKEN_HEX_LEN as EXT_MIN,
} from "../../extension/src/connect-snippet.js";
import { shouldOpenWelcome } from "../../extension/src/welcome-gate.js";
import {
  assertTokenStrength,
  loadOrCreateConfig,
  mintTokenHex,
  parseWsPort,
  MIN_TOKEN_HEX_LEN,
} from "../../packages/mcp-server/src/config.js";

describe("config env precedence", () => {
  it("uses PERFECT_TOKEN from env over anything else", () => {
    const token = "a".repeat(MIN_TOKEN_HEX_LEN);
    const cfg = loadOrCreateConfig({
      PERFECT_TOKEN: token,
      PERFECT_WS_PORT: "19001",
    });
    expect(cfg.token).toBe(token);
    expect(cfg.wsPort).toBe(19001);
  });

  it("rejects short env token", () => {
    expect(() =>
      loadOrCreateConfig({ PERFECT_TOKEN: "tooshort" }),
    ).toThrow(/too short/);
  });

  it("rejects empty env token via assert", () => {
    expect(() => assertTokenStrength("")).toThrow();
    expect(() => assertTokenStrength("abc")).toThrow();
  });

  it("parseWsPort falls back on invalid", () => {
    expect(parseWsPort(undefined, 17321)).toBe(17321);
    expect(parseWsPort("nope", 17321)).toBe(17321);
    expect(parseWsPort("0", 17321)).toBe(17321);
    expect(parseWsPort("8080")).toBe(8080);
  });

  it("mintTokenHex is long enough", () => {
    const t = mintTokenHex();
    expect(t.length).toBeGreaterThanOrEqual(MIN_TOKEN_HEX_LEN);
    expect(t).toMatch(/^[0-9a-f]+$/);
  });
});

describe("connect-snippet builders", () => {
  const token = "b".repeat(EXT_MIN);

  it("mints ≥48 hex chars", () => {
    const t = mintExt();
    expect(t.length).toBeGreaterThanOrEqual(48);
    expect(assertTokenHex(t)).toBe(true);
  });

  it("puts token only under env for npm default", () => {
    const entry = buildMcpServerEntry({
      token,
      wsPort: 17321,
      mode: "npm",
    });
    const json = JSON.stringify(entry);
    expect(entry).toMatchObject({
      command: "npx",
      args: ["-y", "perfect-mcp"],
      env: { PERFECT_TOKEN: token, PERFECT_WS_PORT: "17321" },
    });
    expect(JSON.stringify(entry.args)).not.toContain(token);
    expect(json).toContain(token);
  });

  it("github mode still uses package=github install", () => {
    const entry = buildMcpServerEntry({
      token,
      wsPort: 17321,
      mode: "github",
    });
    expect(entry).toMatchObject({
      command: "npx",
      args: [
        "-y",
        "--package=github:Gtarafdar/perfect",
        "perfect-mcp",
      ],
    });
  });

  it("node mode requires serverPath", () => {
    expect(() =>
      buildMcpServerEntry({ token, wsPort: 17321, mode: "node" }),
    ).toThrow(/serverPath/);
  });

  it("connect JSON nests under mcpServers.perfect", () => {
    const raw = buildConnectJson({ token, wsPort: 17321, mode: "npm" });
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers.perfect.env.PERFECT_TOKEN).toBe(token);
    expect(parsed.mcpServers.perfect.args).toEqual(["-y", "perfect-mcp"]);
  });

  it("operator prompt is merge-safe, npm-first, and includes GitHub fallback", () => {
    const prompt = buildChatPrompt({ token, wsPort: 17321, mode: "npm" });
    expect(prompt.toLowerCase()).toContain("merge");
    expect(prompt).toMatch(/do not (replace|delete)/i);
    expect(prompt).toContain("mcpServers");
    expect(prompt).toContain("perfect-mcp");
    expect(prompt).toContain("npx");
    expect(prompt).toMatch(/github/i);
    expect(prompt).toContain("--package=github:Gtarafdar/perfect");
    expect(prompt).toContain("EADDRINUSE");
    expect(prompt).toContain("browser_status");
    expect(prompt).toContain("Linked");
    expect(prompt).toContain(token);
    expect(prompt.toLowerCase()).not.toMatch(/enable skip|set.*skip mode/);
    // token once in npm block + once in github fallback block
    expect((prompt.match(new RegExp(token, "g")) ?? []).length).toBe(2);
  });
});

describe("welcome gate", () => {
  it("opens on install", () => {
    expect(
      shouldOpenWelcome({
        reason: "install",
        currentVersion: "0.2.0",
        welcomeSeenVersion: "0.2.0",
      }),
    ).toBe(true);
  });

  it("opens on update when version not yet seen", () => {
    expect(
      shouldOpenWelcome({
        reason: "update",
        currentVersion: "0.2.0",
        welcomeSeenVersion: "0.1.0",
      }),
    ).toBe(true);
  });

  it("does not reopen same version on update", () => {
    expect(
      shouldOpenWelcome({
        reason: "update",
        currentVersion: "0.2.0",
        welcomeSeenVersion: "0.2.0",
      }),
    ).toBe(false);
  });

  it("ignores chrome_update / other reasons", () => {
    expect(
      shouldOpenWelcome({
        reason: "chrome_update",
        currentVersion: "0.2.0",
      }),
    ).toBe(false);
  });
});
