import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ToolName } from "@perfect/protocol";
import { loadOrCreateConfig } from "./config.js";
import { ExtensionBridge } from "./bridge.js";

const TOOLS: Array<{
  name: ToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}> = [
  {
    name: "browser_status",
    description: "Perfect bridge status: extension linked?, permission mode, claimed tabs.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "browser_tabs",
    description: "List Chrome tabs. By default returns Perfect tab group (claimed) tabs.",
    inputSchema: {
      type: "object",
      properties: {
        all: { type: "boolean", description: "Include tabs outside Perfect group" },
      },
    },
  },
  {
    name: "browser_navigate",
    description:
      "Navigate to a URL in the Perfect tab group. Reuses an existing claimed tab by default (pass newTab:true only when you truly need another tab). Always reuse the returned tabId on later tools.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        tabId: { type: "number" },
        newTab: {
          type: "boolean",
          description: "Only true to open an extra tab; default reuses the Perfect tab",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_back",
    description: "Go back in tab history.",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number" } },
    },
  },
  {
    name: "browser_forward",
    description: "Go forward in tab history.",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number" } },
    },
  },
  {
    name: "browser_snapshot",
    description:
      "Compact page map: fields[] and actions[] as ref\\tlabel. One snapshot then many fills. Reuse tabId. Avoid screenshots unless needed (expensive).",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number" } },
    },
  },
  {
    name: "browser_click",
    description: "Cursor moves to ref and clicks. Pass label when known.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        tabId: { type: "number" },
        label: { type: "string", description: "Visible label for security classification" },
      },
      required: ["ref"],
    },
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
        label: { type: "string" },
      },
      required: ["text"],
    },
  },
  {
    name: "browser_fill",
    description:
      "Focus field (cursor) then fill. One field per call. Reuse tabId from navigate/snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        value: { type: "string" },
        tabId: { type: "number" },
        inputType: { type: "string" },
        label: { type: "string", description: "Field label from snapshot" },
      },
      required: ["ref", "value"],
    },
  },
  {
    name: "browser_press",
    description: "Press a key or chord (e.g. Enter, Meta+a).",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        tabId: { type: "number" },
      },
      required: ["key"],
    },
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
        tabId: { type: "number" },
      },
    },
  },
  {
    name: "browser_screenshot",
    description:
      "Capture a PNG screenshot of the tab. Visible content may include sensitive data.",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number" } },
    },
  },
  {
    name: "browser_wait",
    description: "Wait for page settle or a number of milliseconds.",
    inputSchema: {
      type: "object",
      properties: {
        ms: { type: "number" },
        tabId: { type: "number" },
      },
    },
  },
  {
    name: "browser_evaluate",
    description:
      "Guarded JS evaluate (disabled patterns: cookies/storage). Prefer snapshot/click/fill.",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string" },
        tabId: { type: "number" },
      },
      required: ["expression"],
    },
  },
  {
    name: "browser_propose_plan",
    description:
      "Propose sites + approach for Manual mode approval before acting (Claude-style).",
    inputSchema: {
      type: "object",
      properties: {
        sites: { type: "array", items: { type: "string" } },
        approach: { type: "string" },
      },
      required: ["sites", "approach"],
    },
  },
  {
    name: "browser_stop",
    description: "Emergency stop: cancel in-flight work and detach debugger.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function main(): Promise<void> {
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
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name as ToolName;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

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
                  risk: response.risk,
                }),
            },
          ],
          isError: true,
        };
      }

      const result = response.result;
      if (
        result &&
        typeof result === "object" &&
        "pngBase64" in (result as object)
      ) {
        const r = result as { pngBase64: string; mimeType?: string };
        return {
          content: [
            {
              type: "image",
              data: r.pngBase64,
              mimeType: r.mimeType ?? "image/png",
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text:
              typeof result === "string"
                ? result
                : JSON.stringify(result),
          },
        ],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text: e instanceof Error ? e.message : String(e),
          },
        ],
        isError: true,
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
