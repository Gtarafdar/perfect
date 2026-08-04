#!/usr/bin/env node


// src/cli.ts
import { mkdirSync as mkdirSync2, writeFileSync as writeFileSync2, existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { homedir as homedir2, platform } from "node:os";
import { dirname, join as join2, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ../protocol/dist/types.js
var DEFAULT_WS_PORT = 17321;
var NATIVE_HOST_NAME = "com.perfect.bridge";

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

// src/cli.ts
var __dirname = dirname(fileURLToPath(import.meta.url));
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
var [cmd, ...rest] = process.argv.slice(2);
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
//# sourceMappingURL=cli.js.map
