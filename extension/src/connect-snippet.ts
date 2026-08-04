/** Pure connect-snippet builders (no chrome.*) — unit-tested. */

export const MIN_TOKEN_HEX_LEN = 32;
export const PREFERRED_TOKEN_BYTES = 24;

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
  /** Prefer npx after npm publish; use node+path for local git builds */
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
    args: ["-y", "@perfect/mcp"],
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

export function buildChatPrompt(opts: ConnectSnippetOptions): string {
  const json = buildConnectJson(opts);
  return `Please merge the following Perfect MCP server into my ~/.cursor/mcp.json under "mcpServers" (do not delete or replace my other MCP servers). Then tell me to enable the "perfect" server in Cursor Settings → MCP and wait until the Perfect Chrome side panel shows Linked to Cursor.

Do not change Perfect permission mode to Skip. Do not disable Perfect security settings.

\`\`\`json
${json}
\`\`\`
`;
}
