import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { WebSocket } from "ws";
import { ExtensionBridge } from "../../packages/mcp-server/src/bridge.js";
import type { PerfectConfig } from "../../packages/mcp-server/src/config.js";
import { PROTOCOL_VERSION } from "@perfect/protocol";

const LONG_TOKEN = "c".repeat(48);
const OTHER_TOKEN = "d".repeat(48);

describe("ExtensionBridge pairing security", () => {
  const cfg: PerfectConfig = { token: LONG_TOKEN, wsPort: 17331 };
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
            result: { ok: true },
          }),
        );
      }
    });
  });

  afterAll(async () => {
    ext?.close();
    await bridge.stop();
  });

  it("links with matching env-style token and round-trips a tool", async () => {
    expect(bridge.isConnected()).toBe(true);
    const res = await bridge.callTool("browser_status", {});
    expect(res.ok).toBe(true);
  });

  it("denies wrong token", async () => {
    await expect(
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${cfg.wsPort}`);
        ws.on("open", () => {
          ws.send(
            JSON.stringify({
              type: "hello",
              protocolVersion: PROTOCOL_VERSION,
              token: OTHER_TOKEN,
              role: "extension",
            }),
          );
        });
        ws.on("message", (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === "hello_ack") {
            if (!msg.ok) resolve();
            else reject(new Error("should fail auth"));
          }
        });
        ws.on("close", () => resolve());
      }),
    ).resolves.toBeUndefined();
  });
});

describe("token regenerate mismatch", () => {
  it("old token fails against new bridge secret", async () => {
    const port = 17332;
    const oldToken = "e".repeat(48);
    const newToken = "f".repeat(48);

    const bridge = new ExtensionBridge({ token: newToken, wsPort: port });
    await bridge.start();

    await expect(
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        ws.on("open", () => {
          ws.send(
            JSON.stringify({
              type: "hello",
              protocolVersion: PROTOCOL_VERSION,
              token: oldToken,
              role: "extension",
            }),
          );
        });
        ws.on("message", (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === "hello_ack" && !msg.ok) resolve();
          if (msg.type === "hello_ack" && msg.ok) reject(new Error("old token must fail"));
        });
        ws.on("close", () => resolve());
      }),
    ).resolves.toBeUndefined();

    const linked = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            type: "hello",
            protocolVersion: PROTOCOL_VERSION,
            token: newToken,
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

    linked.close();
    await bridge.stop();
  });
});

describe("localhost bind", () => {
  it("listens on 127.0.0.1 only (connect via loopback works)", async () => {
    const port = 17333;
    const token = "a1".repeat(24);
    const bridge = new ExtensionBridge({ token, wsPort: port });
    await bridge.start();

    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      socket.on("open", () => {
        socket.send(
          JSON.stringify({
            type: "hello",
            protocolVersion: PROTOCOL_VERSION,
            token,
            role: "extension",
          }),
        );
      });
      socket.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "hello_ack" && msg.ok) resolve(socket);
        if (msg.type === "hello_ack" && !msg.ok) reject(new Error("auth failed"));
      });
      socket.on("error", reject);
    });

    expect(bridge.isConnected()).toBe(true);
    ws.close();
    await bridge.stop();
  });
});
