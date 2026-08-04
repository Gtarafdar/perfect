#!/usr/bin/env node


// ../protocol/dist/types.js
var PROTOCOL_VERSION = 1;
var DEFAULT_WS_PORT = 17321;

// ../protocol/dist/framing.js
function encodeNativeMessage(message) {
  const json = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}
function createNativeMessageReader(onMessage, onError) {
  let buffer = Buffer.alloc(0);
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const len = buffer.readUInt32LE(0);
      if (len > 1024 * 1024) {
        onError?.(new Error(`Native message too large: ${len}`));
        buffer = Buffer.alloc(0);
        return;
      }
      if (buffer.length < 4 + len)
        return;
      const body = buffer.subarray(4, 4 + len);
      buffer = buffer.subarray(4 + len);
      try {
        const parsed = JSON.parse(body.toString("utf8"));
        onMessage(parsed);
      } catch (e) {
        onError?.(e instanceof Error ? e : new Error(String(e)));
      }
    }
  };
}

// src/host.ts
import WebSocket from "ws";

// src/config.ts
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
var MIN_TOKEN_HEX_LEN = 32;
var PREFERRED_TOKEN_BYTES = 24;
function configDir() {
  return join(homedir(), ".perfect");
}
function configPath() {
  return join(configDir(), "config.json");
}
function mintTokenHex(bytes = PREFERRED_TOKEN_BYTES) {
  return randomBytes(bytes).toString("hex");
}
function assertTokenStrength(token) {
  if (!token || token.trim().length < MIN_TOKEN_HEX_LEN) {
    throw new Error(
      `PERFECT_TOKEN is missing or too short (need \u2265${MIN_TOKEN_HEX_LEN} hex chars)`
    );
  }
}
function parseWsPort(raw, fallback = DEFAULT_WS_PORT) {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback;
  return n;
}
function loadOrCreateConfig(env = process.env) {
  const envToken = env.PERFECT_TOKEN?.trim();
  const envPort = parseWsPort(env.PERFECT_WS_PORT);
  if (envToken) {
    assertTokenStrength(envToken);
    return {
      token: envToken,
      wsPort: envPort
    };
  }
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const path = configPath();
  if (existsSync(path)) {
    const file = JSON.parse(readFileSync(path, "utf8"));
    assertTokenStrength(file.token);
    return {
      token: file.token,
      wsPort: file.wsPort || DEFAULT_WS_PORT,
      extensionId: file.extensionId
    };
  }
  const cfg2 = {
    token: mintTokenHex(),
    wsPort: DEFAULT_WS_PORT
  };
  writeFileSync(path, JSON.stringify(cfg2, null, 2), { mode: 384 });
  return cfg2;
}

// src/host.ts
var cfg = loadOrCreateConfig();
var wsUrl = `ws://127.0.0.1:${cfg.wsPort}`;
var ws = null;
function writeNative(msg) {
  process.stdout.write(encodeNativeMessage(msg));
}
function connectWs() {
  ws = new WebSocket(wsUrl);
  ws.on("open", () => {
  });
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      writeNative(msg);
    } catch {
    }
  });
  ws.on("close", () => {
    setTimeout(connectWs, 1e3);
  });
  ws.on("error", () => {
  });
}
var onChunk = createNativeMessageReader((msg) => {
  if (msg.type === "hello" && msg.role === "extension") {
    if (msg.token !== cfg.token || msg.protocolVersion !== PROTOCOL_VERSION) {
      writeNative({ type: "hello_ack", ok: false, error: "auth failed" });
      return;
    }
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
});
process.stdin.on("data", onChunk);
connectWs();
//# sourceMappingURL=host.js.map
