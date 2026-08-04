#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NATIVE_HOST_NAME } from "@perfect/protocol";
import { loadOrCreateConfig, saveConfig, configDir } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function hostScriptPath(): string {
  return resolve(__dirname, "host.js");
}

function serverPath(): string {
  return resolve(__dirname, "server.js");
}

function nativeHostManifest(extensionId: string): object {
  return {
    name: NATIVE_HOST_NAME,
    description: "Perfect Cursor Chrome bridge",
    path: hostScriptPath(),
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
}

function nativeHostDirs(): string[] {
  const home = homedir();
  const p = platform();
  if (p === "darwin") {
    return [
      join(home, "Library/Application Support/Google/Chrome/NativeMessagingHosts"),
      join(home, "Library/Application Support/Chromium/NativeMessagingHosts"),
      join(home, "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"),
    ];
  }
  if (p === "linux") {
    return [
      join(home, ".config/google-chrome/NativeMessagingHosts"),
      join(home, ".config/chromium/NativeMessagingHosts"),
      join(home, ".config/BraveSoftware/Brave-Browser/NativeMessagingHosts"),
    ];
  }
  if (p === "win32") {
    return [join(home, "AppData/Local/Perfect/NativeMessagingHosts")];
  }
  return [];
}

function writeTokenFiles(): ReturnType<typeof loadOrCreateConfig> {
  const cfg = loadOrCreateConfig();
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(join(configDir(), "token.txt"), cfg.token, { mode: 0o600 });
  writeFileSync(join(configDir(), "ws-port.txt"), String(cfg.wsPort), {
    mode: 0o600,
  });
  return cfg;
}

function cursorSnippetJson(): string {
  return JSON.stringify(
    {
      mcpServers: {
        perfect: {
          command: "node",
          args: [serverPath()],
        },
      },
    },
    null,
    2,
  );
}

function printCursorSnippet(): void {
  console.log(`
Add this to ~/.cursor/mcp.json (merge under "mcpServers" if the file already exists):

${cursorSnippetJson()}

After npm publish you can also use:
  npx -y @perfect/mcp
`);
}

/** First-run for every user — creates token, no extension ID required. */
function setup(opts: { writeCursorConfig?: boolean }): void {
  const cfg = writeTokenFiles();

  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Perfect setup                                           ║
╚══════════════════════════════════════════════════════════╝

STEP 1 — Install the Chrome extension (if you have not)
  • Chrome Web Store, or
  • chrome://extensions → Load unpacked → extension/dist

STEP 2 — Copy your bridge token (paste into Perfect side panel → Link)

  ${cfg.token}

  Also saved at: ${join(configDir(), "token.txt")}

STEP 3 — Add Perfect MCP to Cursor
  • Cursor Settings → MCP → add server, OR merge into ~/.cursor/mcp.json:
`);
  console.log(cursorSnippetJson());
  console.log(`
STEP 4 — Enable the "perfect" MCP in Cursor (green/connected)

STEP 5 — In the Perfect side panel: paste token → Link
  Status should change to: Linked to Cursor

Then ask Cursor:
  "Using Perfect, open https://example.com and snapshot the headings."

Optional (native messaging): perfect install --extension-id <id from chrome://extensions>
`);

  if (opts.writeCursorConfig) {
    writeCursorMcp();
  }
}

function writeCursorMcp(): void {
  const mcpPath = join(homedir(), ".cursor", "mcp.json");
  mkdirSync(dirname(mcpPath), { recursive: true });
  let data: { mcpServers?: Record<string, unknown> } = {};
  if (existsSync(mcpPath)) {
    data = JSON.parse(readFileSync(mcpPath, "utf8")) as typeof data;
  }
  data.mcpServers = data.mcpServers ?? {};
  data.mcpServers.perfect = {
    command: "node",
    args: [serverPath()],
  };
  writeFileSync(mcpPath, JSON.stringify(data, null, 2) + "\n");
  console.log(`Wrote perfect server into ${mcpPath}`);
}

function install(extensionId?: string): void {
  const cfg = writeTokenFiles();
  const id = extensionId ?? cfg.extensionId;
  if (!id) {
    console.log(
      "No extension ID yet — running setup (WebSocket bridge) instead.\n",
    );
    setup({});
    console.log(
      "When you have the ID from chrome://extensions, run:\n  perfect install --extension-id <id>\n",
    );
    return;
  }
  cfg.extensionId = id;
  saveConfig(cfg);

  const manifest = nativeHostManifest(id);
  const manifestFile = `${NATIVE_HOST_NAME}.json`;
  writeFileSync(join(configDir(), manifestFile), JSON.stringify(manifest, null, 2));

  for (const dir of nativeHostDirs()) {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, manifestFile), JSON.stringify(manifest, null, 2));
      console.log(`Registered native host in ${dir}`);
    } catch (e) {
      console.warn(`Could not write ${dir}:`, e);
    }
  }

  console.log(`\nBridge token:\n${cfg.token}`);
  console.log(`WebSocket: ws://127.0.0.1:${cfg.wsPort}`);
  printCursorSnippet();
}

function status(): void {
  const cfg = loadOrCreateConfig();
  console.log(JSON.stringify({ ...cfg, configDir: configDir() }, null, 2));
  console.log("token file exists:", existsSync(join(configDir(), "token.txt")));
}

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case "setup": {
    const writeCursorConfig = rest.includes("--write-cursor-config");
    setup({ writeCursorConfig });
    break;
  }
  case "install": {
    let extId: string | undefined;
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
  1. perfect setup
  2. Paste token in side panel → Link
  3. Enable Perfect MCP in Cursor
  4. Ask Cursor to open example.com via Perfect
`);
    break;
  case "help":
  case undefined:
    console.log(`Perfect CLI — give Cursor hands in Chrome

First step for every user:
  perfect setup
  # or: node path/to/packages/mcp-server/dist/cli.js setup
  # or: npx -y @perfect/mcp setup   (after publish)

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
