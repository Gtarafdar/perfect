/** Pure connect-snippet builders (no chrome.*) — unit-tested. */

export const MIN_TOKEN_HEX_LEN = 32;
export const PREFERRED_TOKEN_BYTES = 24;

/** npm name after publish; GitHub install works today without publishing. */
export const NPM_PACKAGE = "perfect-mcp";

/**
 * Installs the whole repo from GitHub — root package.json exposes `perfect-mcp`
 * bin pointing at the prebuilt (fully bundled) dist. Do NOT use `#path:…`:
 * npm ignores it here and installs the root without linking the nested bin.
 * Default end-user mode is `npm`; `github` is fallback when the registry package is missing.
 */
export const GITHUB_PACKAGE = "github:Gtarafdar/perfect";

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
  /**
   * npm — default for end users (registry publish)
   * github — fallback if perfect-mcp is missing from npm
   * node — local absolute path (developers only)
   */
  mode: "github" | "npm" | "node";
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
  if (opts.mode === "npm") {
    return {
      command: "npx",
      args: ["-y", NPM_PACKAGE],
      env,
    };
  }
  // github fallback: no registry publish needed
  return {
    command: "npx",
    args: ["-y", `--package=${GITHUB_PACKAGE}`, NPM_PACKAGE],
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
  const githubEntry =
    opts.mode === "npm"
      ? buildMcpServerEntry({ ...opts, mode: "github" })
      : null;
  const githubJson = githubEntry
    ? JSON.stringify({ mcpServers: { perfect: githubEntry } }, null, 2)
    : null;

  const installRule =
    opts.mode === "npm"
      ? `- End users install via npm (\`npx -y ${NPM_PACKAGE}\`). Use the GitHub package block below only if npm 404s / package missing.`
      : `- End users install via GitHub (\`npx -y --package=${GITHUB_PACKAGE} ${NPM_PACKAGE}\`). Do not ask for a local server.js path unless developing from a git checkout.`;

  const fallbackSection = githubJson
    ? `
## Fallback if npm package is missing
If \`npx -y ${NPM_PACKAGE}\` fails (404 / not found on the registry), merge this GitHub install instead (same token/port):
\`\`\`json
${githubJson}
\`\`\`
`
    : "";

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
${installRule}

## Exact server block to merge
\`\`\`json
${json}
\`\`\`
${fallbackSection}
## Steps
1. Read ~/.cursor/mcp.json if it exists. Merge mcpServers.perfect = the block above. Write the file back preserving every other server.
2. Tell me to open Cursor Settings → MCP and enable **perfect** (toggle off/on if it was already on so env reloads). First start may take a minute while npx fetches the package.
3. If MCP logs show EADDRINUSE on 127.0.0.1:${port}: free that port (kill the stale Perfect/node listener on ${port}), then re-enable perfect. Do not change the port number.
4. If install fails, report the error clearly. Prefer the primary block above; use GitHub fallback only when npm is unavailable. Do not ask me for a local server.js path unless I am developing from a git checkout.
5. When Perfect tools are available, call browser_status. If it succeeds, tell me the panel should show Linked. If the panel still says Waiting, ask me to click Reconnect once in the Perfect side panel.
6. Token thrift: reuse tabId; one snapshot then many fills; skip screenshots unless necessary; don't re-navigate the same URL.
7. If a tool errors with "Extension disconnected": wait ~2s, call browser_status, then retry the SAME tool once (same tabId/ref) — do not restart the whole task.
8. Reply with a short confirmation when Linked is expected.

Start now.`;
}
