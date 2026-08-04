#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NATIVE_HOST_NAME } from "@perfect/protocol";
import { loadOrCreateConfig, saveConfig, configDir } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function hostScriptPath(): string {
  return resolve(__dirname, "host.js");
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

function printCursorSnippet(): void {
  const serverPath = resolve(__dirname, "server.js");
  console.log(`
Add to ~/.cursor/mcp.json (or project .cursor/mcp.json):

{
  "mcpServers": {
    "perfect": {
      "command": "node",
      "args": ["${serverPath}"]
    }
  }
}

Or after npm publish:

{
  "mcpServers": {
    "perfect": {
      "command": "npx",
      "args": ["-y", "@perfect/mcp"]
    }
  }
}
`);
}

function install(extensionId?: string): void {
  const cfg = loadOrCreateConfig();
  const id = extensionId ?? cfg.extensionId;
  if (!id) {
    console.error(
      "Missing extension ID. Load the unpacked extension in chrome://extensions, copy its ID, then run:\n  perfect install --extension-id <id>",
    );
    process.exit(1);
  }
  cfg.extensionId = id;
  saveConfig(cfg);

  const manifest = nativeHostManifest(id);
  const manifestFile = `${NATIVE_HOST_NAME}.json`;
  const localCopy = join(configDir(), manifestFile);
  writeFileSync(localCopy, JSON.stringify(manifest, null, 2));

  // Token file for extension to read via native host / user pastes into panel
  writeFileSync(
    join(configDir(), "token.txt"),
    cfg.token,
    { mode: 0o600 },
  );
  writeFileSync(
    join(configDir(), "ws-port.txt"),
    String(cfg.wsPort),
    { mode: 0o600 },
  );

  for (const dir of nativeHostDirs()) {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, manifestFile), JSON.stringify(manifest, null, 2));
      console.log(`Registered native host in ${dir}`);
    } catch (e) {
      console.warn(`Could not write ${dir}:`, e);
    }
  }

  console.log(`\nPerfect token (also in ~/.perfect/token.txt):\n${cfg.token}`);
  console.log(`WebSocket: ws://127.0.0.1:${cfg.wsPort}`);
  console.log("\nPaste the token into the Perfect side panel if prompted.");
  printCursorSnippet();
}

function status(): void {
  const cfg = loadOrCreateConfig();
  console.log(JSON.stringify({ ...cfg, configDir: configDir() }, null, 2));
  const tokenFile = join(configDir(), "token.txt");
  console.log("token file exists:", existsSync(tokenFile));
}

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
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
    console.log(loadOrCreateConfig().token);
    break;
  case "demo":
    console.log(`
Perfect demo script (record this for social):

1. Load extension from extension/dist (chrome://extensions → Load unpacked)
2. Run: node packages/mcp-server/dist/cli.js install --extension-id <id>
3. Add MCP config to Cursor (perfect cursor-config)
4. In Cursor, ask:
   "Using Perfect browser tools: open https://example.com in a Perfect tab,
    take a snapshot, and summarize the headings."

See docs/demo-script.md for the full 30s take.
`);
    break;
  case "help":
  case undefined:
    console.log(`Perfect CLI

  perfect install --extension-id <id>  Register native host + print Cursor MCP config
  perfect status                       Show config
  perfect token                        Print bridge auth token
  perfect cursor-config                Print mcp.json snippet
  perfect demo                         Print demo recording steps
`);
    break;
  default:
    console.error("Unknown command:", cmd);
    process.exit(1);
}
