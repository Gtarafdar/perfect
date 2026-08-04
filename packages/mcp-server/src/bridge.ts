import { EventEmitter } from "node:events";
import { WebSocketServer, WebSocket } from "ws";
import {
  PROTOCOL_VERSION,
  type BridgeMessage,
  type ToolName,
  type ToolResponse,
} from "@perfect/protocol";
import type { PerfectConfig } from "./config.js";

export class ExtensionBridge extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private ext: WebSocket | null = null;
  private pending = new Map<
    string,
    {
      resolve: (r: ToolResponse) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private connected = false;

  constructor(private cfg: PerfectConfig) {
    super();
  }

  async start(): Promise<void> {
    if (this.wss) return;
    this.wss = new WebSocketServer({
      host: "127.0.0.1",
      port: this.cfg.wsPort,
    });

    this.wss.on("connection", (ws, req) => {
      const remote = req.socket.remoteAddress;
      if (remote !== "127.0.0.1" && remote !== "::1" && remote !== ":ffff:127.0.0.1") {
        ws.close(1008, "localhost only");
        return;
      }
      ws.on("message", (data) => this.onRaw(ws, data.toString()));
      ws.on("close", () => {
        if (this.ext === ws) {
          this.ext = null;
          this.connected = false;
          this.emit("disconnected");
          for (const [id, p] of this.pending) {
            clearTimeout(p.timer);
            p.reject(new Error("Extension disconnected"));
            this.pending.delete(id);
          }
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.wss!.once("listening", () => resolve());
      this.wss!.once("error", reject);
    });
  }

  async stop(): Promise<void> {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Bridge stopped"));
    }
    this.pending.clear();
    this.ext?.close();
    this.ext = null;
    await new Promise<void>((resolve) => {
      if (!this.wss) return resolve();
      this.wss.close(() => resolve());
      this.wss = null;
    });
  }

  isConnected(): boolean {
    return this.connected && !!this.ext && this.ext.readyState === WebSocket.OPEN;
  }

  private send(ws: WebSocket, msg: BridgeMessage): void {
    ws.send(JSON.stringify(msg));
  }

  private onRaw(ws: WebSocket, raw: string): void {
    let msg: BridgeMessage;
    try {
      msg = JSON.parse(raw) as BridgeMessage;
    } catch {
      return;
    }

    if (msg.type === "hello") {
      if (msg.token !== this.cfg.token || msg.protocolVersion !== PROTOCOL_VERSION) {
        this.send(ws, {
          type: "hello_ack",
          ok: false,
          error: "auth failed",
        });
        ws.close(1008, "auth failed");
        return;
      }
      if (msg.role !== "extension") {
        this.send(ws, { type: "hello_ack", ok: false, error: "expected extension" });
        ws.close();
        return;
      }
      this.ext = ws;
      this.connected = true;
      this.send(ws, { type: "hello_ack", ok: true });
      this.emit("connected");
      return;
    }

    if (ws !== this.ext) return;

    if (msg.type === "tool_response") {
      const p = this.pending.get(msg.id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        p.resolve(msg);
      }
      return;
    }

    if (msg.type === "event") {
      this.emit("event", msg);
    }
  }

  callTool(
    tool: ToolName,
    args: Record<string, unknown>,
    timeoutMs = 60000,
  ): Promise<ToolResponse> {
    if (!this.isConnected() || !this.ext) {
      return Promise.reject(
        new Error(
          "Perfect extension not connected. Open Chrome, load Perfect, and ensure the side panel shows Linked.",
        ),
      );
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const req = { type: "tool_request" as const, id, tool, args };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Tool timeout: ${tool}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send(this.ext!, req);
    });
  }
}
