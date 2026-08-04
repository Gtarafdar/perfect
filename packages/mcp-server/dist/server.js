#!/usr/bin/env node


// src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

// src/config.ts
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

// ../protocol/dist/types.js
var PROTOCOL_VERSION = 1;
var DEFAULT_WS_PORT = 17321;

// src/config.ts
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
  const cfg = {
    token: mintTokenHex(),
    wsPort: DEFAULT_WS_PORT
  };
  writeFileSync(path, JSON.stringify(cfg, null, 2), { mode: 384 });
  return cfg;
}

// src/bridge.ts
import { EventEmitter } from "node:events";
import { execSync } from "node:child_process";
import { WebSocketServer, WebSocket } from "ws";
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function freeLocalPort(port) {
  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    for (const line of out.split("\n")) {
      const pid = Number(line.trim());
      if (!pid || pid === process.pid) continue;
      try {
        process.kill(pid, "SIGTERM");
      } catch {
      }
    }
  } catch {
  }
}
var ExtensionBridge = class extends EventEmitter {
  constructor(cfg) {
    super();
    this.cfg = cfg;
  }
  wss = null;
  ext = null;
  pending = /* @__PURE__ */ new Map();
  connected = false;
  pingTimer = null;
  async start() {
    if (this.wss) return;
    await this.listenWithRetry(2);
  }
  /** Bind WS; on EADDRINUSE kill the stale localhost listener (prior Perfect MCP) and retry. */
  async listenWithRetry(attemptsLeft) {
    this.wss = new WebSocketServer({
      host: "127.0.0.1",
      port: this.cfg.wsPort
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
      await new Promise((resolve, reject) => {
        this.wss.once("listening", () => resolve());
        this.wss.once("error", (err) => reject(err));
      });
    } catch (err) {
      const e = err;
      try {
        this.wss.close();
      } catch {
      }
      this.wss = null;
      if (e.code === "EADDRINUSE" && attemptsLeft > 0) {
        console.error(
          `[perfect] port ${this.cfg.wsPort} busy \u2014 freeing stale Perfect listener and retrying`
        );
        await freeLocalPort(this.cfg.wsPort);
        await delay(400);
        return this.listenWithRetry(attemptsLeft - 1);
      }
      if (e.code === "EADDRINUSE") {
        throw new Error(
          `Perfect bridge port ${this.cfg.wsPort} is already in use (EADDRINUSE). Free it (quit the other Perfect MCP / kill the process on 127.0.0.1:${this.cfg.wsPort}) then re-enable the perfect MCP in Cursor. Do not change PERFECT_WS_PORT unless you also update the Chrome extension.`
        );
      }
      throw e;
    }
  }
  async stop() {
    this.stopPing();
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Bridge stopped"));
    }
    this.pending.clear();
    this.ext?.close();
    this.ext = null;
    await new Promise((resolve) => {
      if (!this.wss) return resolve();
      this.wss.close(() => resolve());
      this.wss = null;
    });
  }
  isConnected() {
    return this.connected && !!this.ext && this.ext.readyState === WebSocket.OPEN;
  }
  /** Wait until extension is Linked (after a drop), or timeout. */
  waitUntilConnected(timeoutMs = 8e3) {
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
  startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (!this.isConnected() || !this.ext) return;
      try {
        this.send(this.ext, { type: "ping", t: Date.now() });
      } catch {
      }
    }, 12e3);
  }
  stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
  send(ws, msg) {
    ws.send(JSON.stringify(msg));
  }
  onRaw(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "hello") {
      if (msg.token !== this.cfg.token || msg.protocolVersion !== PROTOCOL_VERSION) {
        this.send(ws, {
          type: "hello_ack",
          ok: false,
          error: "auth failed"
        });
        ws.close(1008, "auth failed");
        return;
      }
      if (msg.role !== "extension") {
        this.send(ws, { type: "hello_ack", ok: false, error: "expected extension" });
        ws.close();
        return;
      }
      if (this.ext && this.ext !== ws) {
        try {
          this.ext.close(1e3, "replaced");
        } catch {
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
  callToolOnce(tool, args, timeoutMs) {
    if (!this.isConnected() || !this.ext) {
      return Promise.reject(
        new Error(
          "Perfect extension not connected. Open Chrome, load Perfect, and ensure the side panel shows Linked."
        )
      );
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const req = { type: "tool_request", id, tool, args };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Tool timeout: ${tool}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send(this.ext, req);
    });
  }
  /**
   * Call a tool; if the extension drops mid-call, wait for Linked and retry once
   * with the same args (same session resume).
   */
  async callTool(tool, args, timeoutMs = 6e4) {
    try {
      return await this.callToolOnce(tool, args, timeoutMs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/disconnected|not connected/i.test(msg)) throw e;
      const back = await this.waitUntilConnected(2e4);
      if (!back) {
        throw new Error(
          `${msg} \u2014 wait for Linked, then retry the same tool (same tabId/ref).`
        );
      }
      await new Promise((r) => setTimeout(r, 400));
      return this.callToolOnce(tool, args, timeoutMs);
    }
  }
};

// src/server.ts
var TOOLS = [
  {
    name: "browser_status",
    description: "Perfect bridge status: extension linked?, permission mode, claimed tabs.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "browser_tabs",
    description: "List Chrome tabs. By default returns Perfect tab group (claimed) tabs.",
    inputSchema: {
      type: "object",
      properties: {
        all: { type: "boolean", description: "Include tabs outside Perfect group" }
      }
    }
  },
  {
    name: "browser_navigate",
    description: "Navigate to a URL in the Perfect tab group. Reuses an existing claimed tab by default (pass newTab:true only when you truly need another tab). Always reuse the returned tabId on later tools.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        tabId: { type: "number" },
        newTab: {
          type: "boolean",
          description: "Only true to open an extra tab; default reuses the Perfect tab"
        }
      },
      required: ["url"]
    }
  },
  {
    name: "browser_back",
    description: "Go back in tab history.",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number" } }
    }
  },
  {
    name: "browser_forward",
    description: "Go forward in tab history.",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number" } }
    }
  },
  {
    name: "browser_snapshot",
    description: "Page map: fields[] and actions[] as ref\\tlabel. Modes: compact (default), full (more roles/dialogs), text (adds readable body). Pierces same-origin iframes (frame:fN on actions). Prefer over evaluate for reading pages.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number" },
        mode: {
          type: "string",
          enum: ["compact", "full", "text"],
          description: "compact=token-lean; full=more elements; text=include page text"
        }
      }
    }
  },
  {
    name: "browser_click",
    description: "Visible cursor moves to ref and clicks (works in same-origin iframes after snapshot). Pass label when known.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        tabId: { type: "number" },
        label: { type: "string", description: "Visible label for security classification" }
      },
      required: ["ref"]
    }
  },
  {
    name: "browser_hover",
    description: "Move visible cursor and hover a ref (open menus, flip boxes, tooltips).",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        tabId: { type: "number" },
        label: { type: "string" }
      },
      required: ["ref"]
    }
  },
  {
    name: "browser_select",
    description: "Choose a value on a <select> or similar field by ref.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        value: { type: "string" },
        tabId: { type: "number" },
        label: { type: "string" }
      },
      required: ["ref", "value"]
    }
  },
  {
    name: "browser_type",
    description: "Type into focused field or ref (append).",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        ref: { type: "string" },
        tabId: { type: "number" },
        submit: { type: "boolean" },
        label: { type: "string" }
      },
      required: ["text"]
    }
  },
  {
    name: "browser_fill",
    description: "Focus field (cursor) then fill. One field per call. Reuse tabId from navigate/snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        value: { type: "string" },
        tabId: { type: "number" },
        inputType: { type: "string" },
        label: { type: "string", description: "Field label from snapshot" }
      },
      required: ["ref", "value"]
    }
  },
  {
    name: "browser_press",
    description: "Press a key or chord (e.g. Enter, Meta+a).",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        tabId: { type: "number" }
      },
      required: ["key"]
    }
  },
  {
    name: "browser_scroll",
    description: "Scroll the page or an element into view.",
    inputSchema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["up", "down", "left", "right"] },
        amount: { type: "number" },
        ref: { type: "string" },
        tabId: { type: "number" }
      }
    }
  },
  {
    name: "browser_screenshot",
    description: "Capture PNG. Optional refs[] + labels[] draws lime annotations before capture (for docs/bugs). fullPage/clip supported. May include sensitive on-screen data.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number" },
        refs: { type: "array", items: { type: "string" } },
        labels: { type: "array", items: { type: "string" } },
        fullPage: { type: "boolean" },
        clip: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
            width: { type: "number" },
            height: { type: "number" }
          }
        }
      }
    }
  },
  {
    name: "browser_wait",
    description: "Wait ms, or until selector appears (same-origin iframes included), or urlIncludes matches. Cap 30s.",
    inputSchema: {
      type: "object",
      properties: {
        ms: { type: "number" },
        timeoutMs: { type: "number" },
        selector: { type: "string" },
        urlIncludes: { type: "string" },
        tabId: { type: "number" }
      }
    }
  },
  {
    name: "browser_extract",
    description: "Scrape text/attrs/links/tables when site scripts fail. Prefer over evaluate. Never reads cookies/storage.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number" },
        selector: { type: "string", description: "CSS selector (default headings/paragraphs)" },
        links: { type: "boolean", description: "Include links (default true)" },
        tables: { type: "boolean", description: "Include table grids" },
        attrs: { type: "array", items: { type: "string" } }
      }
    }
  },
  {
    name: "browser_console",
    description: "Read recent page console messages (redacted). Protected \u2014 may include sensitive logs.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number" },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "browser_tab_focus",
    description: "Activate a claimed Perfect-group tab.",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number" } }
    }
  },
  {
    name: "browser_tab_close",
    description: "Close a claimed Perfect-group tab only (will not close arbitrary tabs).",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number" } }
    }
  },
  {
    name: "browser_drag",
    description: "Drag from fromRef to toRef with visible cursor (HTML5 drag + mouse). Snapshot both refs first.",
    inputSchema: {
      type: "object",
      properties: {
        fromRef: { type: "string" },
        toRef: { type: "string" },
        tabId: { type: "number" },
        label: { type: "string" }
      },
      required: ["fromRef", "toRef"]
    }
  },
  {
    name: "browser_upload",
    description: "Set files on input[type=file] by ref. Requires absolute local path(s). Protected \u2014 claimed tabs only.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        path: { type: "string", description: "Absolute file path" },
        paths: { type: "array", items: { type: "string" } },
        tabId: { type: "number" },
        label: { type: "string" }
      },
      required: ["ref"]
    }
  },
  {
    name: "browser_network",
    description: "Read-only recent network requests (URL redacted when sensitive). Protected \u2014 no interception/rewrite.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number" },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "browser_handle_dialog",
    description: "Accept or dismiss a pending JS alert/confirm/prompt (Page.handleJavaScriptDialog).",
    inputSchema: {
      type: "object",
      properties: {
        accept: { type: "boolean", description: "Default true" },
        promptText: { type: "string" },
        tabId: { type: "number" }
      }
    }
  },
  {
    name: "browser_evaluate",
    description: "Guarded JS evaluate (disabled patterns: cookies/storage). Prefer snapshot/extract/click/fill.",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string" },
        tabId: { type: "number" }
      },
      required: ["expression"]
    }
  },
  {
    name: "browser_propose_plan",
    description: "Propose sites + approach for Manual mode approval before acting (Claude-style).",
    inputSchema: {
      type: "object",
      properties: {
        sites: { type: "array", items: { type: "string" } },
        approach: { type: "string" }
      },
      required: ["sites", "approach"]
    }
  },
  {
    name: "browser_stop",
    description: "Emergency stop: cancel in-flight work and detach debugger.",
    inputSchema: { type: "object", properties: {} }
  }
];
async function main() {
  const cfg = loadOrCreateConfig();
  const bridge = new ExtensionBridge(cfg);
  try {
    await bridge.start();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(1);
  }
  const server = new Server(
    { name: "perfect", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }));
    return { tools };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments ?? {};
    try {
      const response = await bridge.callTool(name, args);
      if (!response.ok) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: response.error,
                decision: response.decision,
                risk: response.risk
              })
            }
          ],
          isError: true
        };
      }
      const result = response.result;
      if (result && typeof result === "object" && "pngBase64" in result) {
        const r = result;
        return {
          content: [
            {
              type: "image",
              data: r.pngBase64,
              mimeType: r.mimeType ?? "image/png"
            }
          ]
        };
      }
      return {
        content: [
          {
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result)
          }
        ]
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text: e instanceof Error ? e.message : String(e)
          }
        ],
        isError: true
      };
    }
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const shutdown = async () => {
    await bridge.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
//# sourceMappingURL=server.js.map
