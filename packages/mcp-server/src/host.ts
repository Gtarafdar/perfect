/**
 * Native Messaging host entry — Chrome launches this and talks over stdin/stdout.
 * For v1 we primarily use WebSocket; this host bridges NM ↔ local WS so the
 * extension can use either transport.
 */
import { createNativeMessageReader, encodeNativeMessage, PROTOCOL_VERSION } from "@perfect/protocol";
import type { BridgeMessage } from "@perfect/protocol";
import WebSocket from "ws";
import { loadOrCreateConfig } from "./config.js";

const cfg = loadOrCreateConfig();
const wsUrl = `ws://127.0.0.1:${cfg.wsPort}`;

let ws: WebSocket | null = null;

function writeNative(msg: BridgeMessage): void {
  process.stdout.write(encodeNativeMessage(msg));
}

function connectWs(): void {
  ws = new WebSocket(wsUrl);
  ws.on("open", () => {
    // Host is a pipe; extension still does hello on its WS connection.
  });
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as BridgeMessage;
      writeNative(msg);
    } catch {
      /* ignore */
    }
  });
  ws.on("close", () => {
    setTimeout(connectWs, 1000);
  });
  ws.on("error", () => {
    /* reconnect via close */
  });
}

const onChunk = createNativeMessageReader((msg) => {
  if (msg.type === "hello" && msg.role === "extension") {
    // Extension may hello via NM; forward after ensuring token
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
