#!/usr/bin/env node

var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// ../protocol/dist/types.js
var PROTOCOL_VERSION, DEFAULT_WS_PORT, NATIVE_HOST_NAME;
var init_types = __esm({
  "../protocol/dist/types.js"() {
    "use strict";
    PROTOCOL_VERSION = 1;
    DEFAULT_WS_PORT = 17321;
    NATIVE_HOST_NAME = "com.perfect.bridge";
  }
});

// ../protocol/dist/security.js
var init_security = __esm({
  "../protocol/dist/security.js"() {
    "use strict";
  }
});

// ../protocol/dist/framing.js
var init_framing = __esm({
  "../protocol/dist/framing.js"() {
    "use strict";
  }
});

// ../protocol/dist/index.js
var init_dist = __esm({
  "../protocol/dist/index.js"() {
    "use strict";
    init_types();
    init_security();
    init_framing();
  }
});

// src/config.ts
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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
function saveConfig(cfg) {
  assertTokenStrength(cfg.token);
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { mode: 384 });
}
var MIN_TOKEN_HEX_LEN, PREFERRED_TOKEN_BYTES;
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    init_dist();
    MIN_TOKEN_HEX_LEN = 32;
    PREFERRED_TOKEN_BYTES = 24;
  }
});

// src/cli.ts
var cli_exports = {};
import { mkdirSync as mkdirSync2, writeFileSync as writeFileSync2, existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { homedir as homedir2, platform } from "node:os";
import { dirname, join as join2, resolve } from "node:path";
import { fileURLToPath } from "node:url";
function hostScriptPath() {
  return resolve(__dirname, "host.js");
}
function serverPath() {
  return resolve(__dirname, "server.js");
}
function nativeHostManifest(extensionId) {
  return {
    name: NATIVE_HOST_NAME,
    description: "Perfect Cursor Chrome bridge",
    path: hostScriptPath(),
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`]
  };
}
function nativeHostDirs() {
  const home = homedir2();
  const p = platform();
  if (p === "darwin") {
    return [
      join2(home, "Library/Application Support/Google/Chrome/NativeMessagingHosts"),
      join2(home, "Library/Application Support/Chromium/NativeMessagingHosts"),
      join2(home, "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts")
    ];
  }
  if (p === "linux") {
    return [
      join2(home, ".config/google-chrome/NativeMessagingHosts"),
      join2(home, ".config/chromium/NativeMessagingHosts"),
      join2(home, ".config/BraveSoftware/Brave-Browser/NativeMessagingHosts")
    ];
  }
  if (p === "win32") {
    return [join2(home, "AppData/Local/Perfect/NativeMessagingHosts")];
  }
  return [];
}
function writeTokenFiles() {
  const cfg = loadOrCreateConfig();
  mkdirSync2(configDir(), { recursive: true });
  writeFileSync2(join2(configDir(), "token.txt"), cfg.token, { mode: 384 });
  writeFileSync2(join2(configDir(), "ws-port.txt"), String(cfg.wsPort), {
    mode: 384
  });
  return cfg;
}
function cursorSnippetJson() {
  return JSON.stringify(
    {
      mcpServers: {
        perfect: {
          command: "node",
          args: [serverPath()]
        }
      }
    },
    null,
    2
  );
}
function printCursorSnippet() {
  console.log(`
Add this to ~/.cursor/mcp.json (merge under "mcpServers" if the file already exists):

${cursorSnippetJson()}

After npm publish you can also use:
  npx -y @perfect/mcp
`);
}
function setup(opts) {
  const cfg = writeTokenFiles();
  console.log(`
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551  Perfect setup                                           \u2551
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D

STEP 1 \u2014 Install the Chrome extension (if you have not)
  \u2022 Chrome Web Store, or
  \u2022 chrome://extensions \u2192 Load unpacked \u2192 extension/dist

STEP 2 \u2014 Copy your bridge token (paste into Perfect side panel \u2192 Link)

  ${cfg.token}

  Also saved at: ${join2(configDir(), "token.txt")}

STEP 3 \u2014 Add Perfect MCP to Cursor
  \u2022 Cursor Settings \u2192 MCP \u2192 add server, OR merge into ~/.cursor/mcp.json:
`);
  console.log(cursorSnippetJson());
  console.log(`
STEP 4 \u2014 Enable the "perfect" MCP in Cursor (green/connected)

STEP 5 \u2014 In the Perfect side panel: paste token \u2192 Link
  Status should change to: Linked to Cursor

Then ask Cursor:
  "Using Perfect, open https://example.com and snapshot the headings."

Optional (native messaging): perfect install --extension-id <id from chrome://extensions>
`);
  if (opts.writeCursorConfig) {
    writeCursorMcp();
  }
}
function writeCursorMcp() {
  const mcpPath = join2(homedir2(), ".cursor", "mcp.json");
  mkdirSync2(dirname(mcpPath), { recursive: true });
  let data = {};
  if (existsSync2(mcpPath)) {
    data = JSON.parse(readFileSync2(mcpPath, "utf8"));
  }
  data.mcpServers = data.mcpServers ?? {};
  data.mcpServers.perfect = {
    command: "node",
    args: [serverPath()]
  };
  writeFileSync2(mcpPath, JSON.stringify(data, null, 2) + "\n");
  console.log(`Wrote perfect server into ${mcpPath}`);
}
function install(extensionId) {
  const cfg = writeTokenFiles();
  const id = extensionId ?? cfg.extensionId;
  if (!id) {
    console.log(
      "No extension ID yet \u2014 running setup (WebSocket bridge) instead.\n"
    );
    setup({});
    console.log(
      "When you have the ID from chrome://extensions, run:\n  perfect install --extension-id <id>\n"
    );
    return;
  }
  cfg.extensionId = id;
  saveConfig(cfg);
  const manifest = nativeHostManifest(id);
  const manifestFile = `${NATIVE_HOST_NAME}.json`;
  writeFileSync2(join2(configDir(), manifestFile), JSON.stringify(manifest, null, 2));
  for (const dir of nativeHostDirs()) {
    try {
      mkdirSync2(dir, { recursive: true });
      writeFileSync2(join2(dir, manifestFile), JSON.stringify(manifest, null, 2));
      console.log(`Registered native host in ${dir}`);
    } catch (e) {
      console.warn(`Could not write ${dir}:`, e);
    }
  }
  console.log(`
Bridge token:
${cfg.token}`);
  console.log(`WebSocket: ws://127.0.0.1:${cfg.wsPort}`);
  printCursorSnippet();
}
function status() {
  const cfg = loadOrCreateConfig();
  console.log(JSON.stringify({ ...cfg, configDir: configDir() }, null, 2));
  console.log("token file exists:", existsSync2(join2(configDir(), "token.txt")));
}
var __dirname, cmd, rest;
var init_cli = __esm({
  "src/cli.ts"() {
    "use strict";
    init_dist();
    init_config();
    __dirname = dirname(fileURLToPath(import.meta.url));
    [cmd, ...rest] = process.argv.slice(2);
    switch (cmd) {
      case "setup": {
        const writeCursorConfig = rest.includes("--write-cursor-config");
        setup({ writeCursorConfig });
        break;
      }
      case "install": {
        let extId;
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === "--extension-id") extId = rest[++i];
        }
        install(extId);
        break;
      }
      case "status":
        status();
        break;
      case "cursor-config":
        printCursorSnippet();
        break;
      case "token":
        console.log(writeTokenFiles().token);
        break;
      case "demo":
        console.log(`
See docs/demo-script.md

Quick:
  1. Load extension \u2192 open side panel (token auto-minted)
  2. Copy connect for Cursor \u2192 enable Perfect MCP
  3. Ask Cursor to open example.com via Perfect
`);
        break;
      case "help":
      case void 0:
        console.log(`Perfect CLI \u2014 give Cursor hands in Chrome

First step for every user:
  npx -y perfect-mcp setup

Commands:
  perfect setup [--write-cursor-config]  Create token + print steps
  perfect token                          Print bridge token only
  perfect install --extension-id <id>    Optional native messaging
  perfect cursor-config                  Print mcp.json snippet
  perfect status                         Show ~/.perfect config
  perfect demo                           Demo recording tips
`);
        break;
      default:
        console.error("Unknown command:", cmd);
        console.error("Run: perfect setup");
        process.exit(1);
    }
  }
});

// src/bridge.ts
import { EventEmitter } from "node:events";
import { WebSocketServer, WebSocket } from "ws";
var ExtensionBridge;
var init_bridge = __esm({
  "src/bridge.ts"() {
    "use strict";
    init_dist();
    ExtensionBridge = class extends EventEmitter {
      constructor(cfg) {
        super();
        this.cfg = cfg;
      }
      wss = null;
      ext = null;
      pending = /* @__PURE__ */ new Map();
      connected = false;
      async start() {
        if (this.wss) return;
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
              this.emit("disconnected");
              for (const [id, p] of this.pending) {
                clearTimeout(p.timer);
                p.reject(new Error("Extension disconnected"));
                this.pending.delete(id);
              }
            }
          });
        });
        await new Promise((resolve2, reject) => {
          this.wss.once("listening", () => resolve2());
          this.wss.once("error", (err) => {
            if (err.code === "EADDRINUSE") {
              reject(
                new Error(
                  `Perfect bridge port ${this.cfg.wsPort} is already in use (EADDRINUSE). Free it (quit the other Perfect MCP / kill the process on 127.0.0.1:${this.cfg.wsPort}) then re-enable the perfect MCP in Cursor. Do not change PERFECT_WS_PORT unless you also update the Chrome extension.`
                )
              );
              return;
            }
            reject(err);
          });
        });
      }
      async stop() {
        for (const [, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new Error("Bridge stopped"));
        }
        this.pending.clear();
        this.ext?.close();
        this.ext = null;
        await new Promise((resolve2) => {
          if (!this.wss) return resolve2();
          this.wss.close(() => resolve2());
          this.wss = null;
        });
      }
      isConnected() {
        return this.connected && !!this.ext && this.ext.readyState === WebSocket.OPEN;
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
      callTool(tool, args2, timeoutMs = 6e4) {
        if (!this.isConnected() || !this.ext) {
          return Promise.reject(
            new Error(
              "Perfect extension not connected. Open Chrome, load Perfect, and ensure the side panel shows Linked."
            )
          );
        }
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const req = { type: "tool_request", id, tool, args: args2 };
        return new Promise((resolve2, reject) => {
          const timer = setTimeout(() => {
            this.pending.delete(id);
            reject(new Error(`Tool timeout: ${tool}`));
          }, timeoutMs);
          this.pending.set(id, { resolve: resolve2, reject, timer });
          this.send(this.ext, req);
        });
      }
    };
  }
});

// src/server.ts
var server_exports = {};
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
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
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }))
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args2 = request.params.arguments ?? {};
    try {
      const response = await bridge.callTool(name, args2);
      if (!response.ok) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: response.error,
                  decision: response.decision,
                  risk: response.risk
                },
                null,
                2
              )
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
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2)
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
var TOOLS;
var init_server = __esm({
  "src/server.ts"() {
    "use strict";
    init_config();
    init_bridge();
    TOOLS = [
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
        description: "Navigate a tab (or create one in the Perfect group) to a URL.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string" },
            tabId: { type: "number" },
            newTab: { type: "boolean" }
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
        description: "Accessibility snapshot with element refs for click/fill. Page content is untrusted (prompt-injection risk).",
        inputSchema: {
          type: "object",
          properties: { tabId: { type: "number" } }
        }
      },
      {
        name: "browser_click",
        description: "Click an element by ref from browser_snapshot.",
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
        name: "browser_type",
        description: "Type text into the focused element or a ref (appends).",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string" },
            ref: { type: "string" },
            tabId: { type: "number" },
            submit: { type: "boolean" }
          },
          required: ["text"]
        }
      },
      {
        name: "browser_fill",
        description: "Clear and fill an input by ref.",
        inputSchema: {
          type: "object",
          properties: {
            ref: { type: "string" },
            value: { type: "string" },
            tabId: { type: "number" },
            inputType: { type: "string" }
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
        description: "Capture a PNG screenshot of the tab. Visible content may include sensitive data.",
        inputSchema: {
          type: "object",
          properties: { tabId: { type: "number" } }
        }
      },
      {
        name: "browser_wait",
        description: "Wait for page settle or a number of milliseconds.",
        inputSchema: {
          type: "object",
          properties: {
            ms: { type: "number" },
            tabId: { type: "number" }
          }
        }
      },
      {
        name: "browser_evaluate",
        description: "Guarded JS evaluate (disabled patterns: cookies/storage). Prefer snapshot/click/fill.",
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
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
});

// src/index.ts
var args = process.argv.slice(2);
var cliCommands = /* @__PURE__ */ new Set([
  "setup",
  "install",
  "token",
  "status",
  "cursor-config",
  "demo",
  "help",
  "-h",
  "--help"
]);
if (args[0] && cliCommands.has(args[0])) {
  await Promise.resolve().then(() => (init_cli(), cli_exports));
} else {
  await Promise.resolve().then(() => (init_server(), server_exports));
}
//# sourceMappingURL=index.js.map
