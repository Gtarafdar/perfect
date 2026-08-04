/** Pure connect-snippet builders (no chrome.*) — unit-tested. */

export const MIN_TOKEN_HEX_LEN = 32;
export const PREFERRED_TOKEN_BYTES = 24;
export const NPM_PACKAGE = "perfect-mcp";

export function mintTokenHex(
  randomBytes: (size: number) => Uint8Array = defaultRandom,
): string {
  const bytes = randomBytes(PREFERRED_TOKEN_BYTES);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function defaultRandom(size: number): Uint8Array {
  const out = new Uint8Array(size);
  crypto.getRandomValues(out);
  return out;
}

export function assertTokenHex(token: string): boolean {
  return Boolean(token && token.trim().length >= MIN_TOKEN_HEX_LEN);
}

export interface ConnectSnippetOptions {
  token: string;
  wsPort: number;
  /** Prefer npx (published package); node+path for local git fallback */
  mode: "npx" | "node";
  serverPath?: string;
}

export function buildMcpServerEntry(opts: ConnectSnippetOptions): Record<string, unknown> {
  if (!assertTokenHex(opts.token)) {
    throw new Error("token too short");
  }
  const env = {
    PERFECT_TOKEN: opts.token,
    PERFECT_WS_PORT: String(opts.wsPort),
  };
  if (opts.mode === "node") {
    if (!opts.serverPath) throw new Error("serverPath required for node mode");
    return {
      command: "node",
      args: [opts.serverPath],
      env,
    };
  }
  return {
    command: "npx",
    args: ["-y", NPM_PACKAGE],
    env,
  };
}

export function buildConnectJson(opts: ConnectSnippetOptions): string {
  return JSON.stringify(
    {
      mcpServers: {
        perfect: buildMcpServerEntry(opts),
      },
    },
    null,
    2,
  );
}

/** Full operator brief — paste once into Cursor; agent does the rest. */
export function buildChatPrompt(opts: ConnectSnippetOptions): string {
  const entry = buildMcpServerEntry(opts);
  const json = JSON.stringify({ mcpServers: { perfect: entry } }, null, 2);
  const port = opts.wsPort;

  return `You are setting up the Perfect Chrome bridge for me end-to-end. Do all of this yourself; do not ask me to edit JSON by hand.

## Goals
1. Merge the Perfect MCP server into ~/.cursor/mcp.json under "mcpServers".
2. Get the Perfect Chrome side panel to show **Linked to Cursor**.

## Hard rules
- MERGE only the "perfect" key under mcpServers.
- Do NOT replace the entire mcp.json file.
- Do NOT delete or overwrite my other MCP servers.
- Do NOT set Perfect permission mode to Skip.
- Do NOT disable Perfect security settings.
- Keep PERFECT_WS_PORT at ${port} (must match the Chrome extension).

## Exact server block to merge
\`\`\`json
${json}
\`\`\`

## Steps
1. Read ~/.cursor/mcp.json if it exists. Merge mcpServers.perfect = the block above. Write the file back preserving every other server.
2. Tell me to open Cursor Settings → MCP and enable **perfect** (toggle off/on if it was already on so env reloads).
3. If MCP logs show EADDRINUSE on 127.0.0.1:${port}: free that port (kill the stale Perfect/node listener on ${port}), then re-enable perfect. Do not change the port number.
4. If MCP logs show npm 404 for ${NPM_PACKAGE}: the package may be unpublished — fall back only if I provide a local server.js path; otherwise report the error clearly.
5. When Perfect tools are available, call browser_status. If it succeeds, tell me the panel should show Linked. If the panel still says Waiting, ask me to click Reconnect once in the Perfect side panel.
6. Reply with a short confirmation when Linked is expected.

Start now.`;
}
