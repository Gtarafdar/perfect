import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { WebSocket } from "ws";
import { ExtensionBridge } from "../../packages/mcp-server/src/bridge.js";
import type { PerfectConfig } from "../../packages/mcp-server/src/config.js";
import { PROTOCOL_VERSION } from "@perfect/protocol";

describe("ExtensionBridge", () => {
  const cfg: PerfectConfig = { token: "test-token-abc", wsPort: 17329 };
  let bridge: ExtensionBridge;
  let ext: WebSocket;

  beforeAll(async () => {
    bridge = new ExtensionBridge(cfg);
    await bridge.start();

    ext = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${cfg.wsPort}`);
      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            type: "hello",
            protocolVersion: PROTOCOL_VERSION,
            token: cfg.token,
            role: "extension",
          }),
        );
      });
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "hello_ack" && msg.ok) resolve(ws);
        if (msg.type === "hello_ack" && !msg.ok) reject(new Error(msg.error));
      });
      ws.on("error", reject);
    });

    ext.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "tool_request") {
        ext.send(
          JSON.stringify({
            type: "tool_response",
            id: msg.id,
            ok: true,
            result: { tabs: [{ id: 1, url: "https://example.com", title: "Example", active: true, claimed: true }] },
          }),
        );
      }
    });
  });

  afterAll(async () => {
    ext?.close();
    await bridge.stop();
  });

  it("rejects bad token", async () => {
    await expect(
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${cfg.wsPort}`);
        ws.on("open", () => {
          ws.send(
            JSON.stringify({
              type: "hello",
              protocolVersion: PROTOCOL_VERSION,
              token: "wrong",
              role: "extension",
            }),
          );
        });
        ws.on("message", (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === "hello_ack") {
            if (!msg.ok) resolve();
            else reject(new Error("should fail"));
          }
        });
        ws.on("close", () => resolve());
      }),
    ).resolves.toBeUndefined();
  });

  it("round-trips browser_tabs", async () => {
    const res = await bridge.callTool("browser_tabs", {});
    expect(res.ok).toBe(true);
    expect(res.result).toMatchObject({
      tabs: expect.any(Array),
    });
  });
});
