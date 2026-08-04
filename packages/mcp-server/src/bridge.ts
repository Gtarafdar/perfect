import { EventEmitter } from "node:events";
import { execSync } from "node:child_process";
import { WebSocketServer, WebSocket } from "ws";
import {
  PROTOCOL_VERSION,
  type BridgeMessage,
  type ToolName,
  type ToolResponse,
} from "@perfect/protocol";
import type { PerfectConfig } from "./config.js";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Best-effort: SIGTERM whatever is listening on 127.0.0.1:port (stale Perfect MCP). */
function freeLocalPort(port: number): void {
  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of out.split("\n")) {
      const pid = Number(line.trim());
      if (!pid || pid === process.pid) continue;
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* */
      }
    }
  } catch {
    /* nothing listening / lsof unavailable */
  }
}

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
  private pingTimer: NodeJS.Timeout | null = null;

  constructor(private cfg: PerfectConfig) {
    super();
  }

  async start(): Promise<void> {
    if (this.wss) return;
    await this.listenWithRetry(2);
  }

  /** Bind WS; on EADDRINUSE kill the stale localhost listener (prior Perfect MCP) and retry. */
  private async listenWithRetry(attemptsLeft: number): Promise<void> {
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
          this.stopPing();
          this.emit("disconnected");
          for (const [id, p] of this.pending) {
            clearTimeout(p.timer);
            p.reject(new Error("Extension disconnected"));
            this.pending.delete(id);
          }
        }
      });
    });

    try {
      await new Promise<void>((resolve, reject) => {
        this.wss!.once("listening", () => resolve());
        this.wss!.once("error", (err: NodeJS.ErrnoException) => reject(err));
      });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      try {
        this.wss.close();
      } catch {
        /* */
      }
      this.wss = null;
      if (e.code === "EADDRINUSE" && attemptsLeft > 0) {
        console.error(
          `[perfect] port ${this.cfg.wsPort} busy — freeing stale Perfect listener and retrying`,
        );
        await freeLocalPort(this.cfg.wsPort);
        await delay(400);
        return this.listenWithRetry(attemptsLeft - 1);
      }
      if (e.code === "EADDRINUSE") {
        throw new Error(
          `Perfect bridge port ${this.cfg.wsPort} is already in use (EADDRINUSE). ` +
            `Free it (quit the other Perfect MCP / kill the process on 127.0.0.1:${this.cfg.wsPort}) ` +
            `then re-enable the perfect MCP in Cursor. Do not change PERFECT_WS_PORT unless you also update the Chrome extension.`,
        );
      }
      throw e;
    }
  }

  async stop(): Promise<void> {
    this.stopPing();
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

  /** Wait until extension is Linked (after a drop), or timeout. */
  waitUntilConnected(timeoutMs = 8000): Promise<boolean> {
    if (this.isConnected()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const onConn = () => {
        cleanup();
        resolve(true);
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.off("connected", onConn);
      };
      this.on("connected", onConn);
    });
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (!this.isConnected() || !this.ext) return;
      try {
        this.send(this.ext, { type: "ping", t: Date.now() });
      } catch {
        /* */
      }
    }, 12000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
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
      // Replace prior extension socket so force-reconnect doesn't leave two half-open links
      if (this.ext && this.ext !== ws) {
        try {
          this.ext.close(1000, "replaced");
        } catch {
          /* */
        }
      }
      this.ext = ws;
      this.connected = true;
      this.send(ws, { type: "hello_ack", ok: true });
      this.startPing();
      this.emit("connected");
      return;
    }

    if (ws !== this.ext) return;

    if (msg.type === "pong") return;

    if (msg.type === "ping") {
      this.send(ws, { type: "pong", t: msg.t });
      return;
    }

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

  private callToolOnce(
    tool: ToolName,
    args: Record<string, unknown>,
    timeoutMs: number,
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

  /**
   * Call a tool; if the extension drops mid-call, wait for Linked and retry once
   * with the same args (same session resume).
   */
  async callTool(
    tool: ToolName,
    args: Record<string, unknown>,
    timeoutMs = 60000,
  ): Promise<ToolResponse> {
    try {
      return await this.callToolOnce(tool, args, timeoutMs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/disconnected|not connected/i.test(msg)) throw e;
      const back = await this.waitUntilConnected(20000);
      if (!back) {
        throw new Error(
          `${msg} — wait for Linked, then retry the same tool (same tabId/ref).`,
        );
      }
      // Brief settle after SW wake
      await new Promise((r) => setTimeout(r, 400));
      return this.callToolOnce(tool, args, timeoutMs);
    }
  }
}
