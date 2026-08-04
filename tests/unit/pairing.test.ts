import { describe, expect, it } from "vitest";
import {
  assertTokenStrength,
  loadOrCreateConfig,
  mintTokenHex,
  parseWsPort,
  MIN_TOKEN_HEX_LEN,
} from "../../packages/mcp-server/src/config.js";
import {
  assertTokenHex,
  buildChatPrompt,
  buildConnectJson,
  buildMcpServerEntry,
  mintTokenHex as mintExt,
  MIN_TOKEN_HEX_LEN as EXT_MIN,
} from "../../extension/src/connect-snippet.js";

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

  it("puts token only under env for npx", () => {
    const entry = buildMcpServerEntry({
      token,
      wsPort: 17321,
      mode: "npx",
    });
    const json = JSON.stringify(entry);
    expect(entry).toMatchObject({
      command: "npx",
      args: ["-y", "@perfect/mcp"],
      env: { PERFECT_TOKEN: token, PERFECT_WS_PORT: "17321" },
    });
    expect(JSON.stringify(entry.args)).not.toContain(token);
    expect(json).toContain(token);
  });

  it("node mode requires serverPath", () => {
    expect(() =>
      buildMcpServerEntry({ token, wsPort: 17321, mode: "node" }),
    ).toThrow(/serverPath/);
  });

  it("connect JSON nests under mcpServers.perfect", () => {
    const raw = buildConnectJson({ token, wsPort: 17321, mode: "npx" });
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers.perfect.env.PERFECT_TOKEN).toBe(token);
  });

  it("chat prompt merges and does not push Skip", () => {
    const prompt = buildChatPrompt({ token, wsPort: 17321, mode: "npx" });
    expect(prompt.toLowerCase()).toContain("merge");
    expect(prompt).toContain("mcpServers");
    expect(prompt).toContain(token);
    expect(prompt.toLowerCase()).not.toMatch(/enable skip|set.*skip mode/);
    expect((prompt.match(new RegExp(token, "g")) ?? []).length).toBe(1);
  });
});
