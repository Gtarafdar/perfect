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
      "Page map: fields[] and actions[] as ref\\tlabel. Modes: compact (default), full (more roles/dialogs), text (adds readable body). Pierces same-origin iframes (frame:fN on actions). Prefer over evaluate for reading pages.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number" },
        mode: {
          type: "string",
          enum: ["compact", "full", "text"],
          description: "compact=token-lean; full=more elements; text=include page text",
        },
      },
    },
  },
  {
    name: "browser_click",
    description:
      "Visible cursor moves to ref and clicks (works in same-origin iframes after snapshot). Pass label when known.",
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
    name: "browser_hover",
    description: "Move visible cursor and hover a ref (open menus, flip boxes, tooltips).",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        tabId: { type: "number" },
        label: { type: "string" },
      },
      required: ["ref"],
    },
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
        label: { type: "string" },
      },
      required: ["ref", "value"],
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
      "Capture PNG. Optional refs[] + labels[] draws lime annotations before capture (for docs/bugs). fullPage/clip supported. May include sensitive on-screen data.",
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
            height: { type: "number" },
          },
        },
      },
    },
  },
  {
    name: "browser_wait",
    description:
      "Wait ms, or until selector appears (same-origin iframes included), or urlIncludes matches. Cap 30s.",
    inputSchema: {
      type: "object",
      properties: {
        ms: { type: "number" },
        timeoutMs: { type: "number" },
        selector: { type: "string" },
        urlIncludes: { type: "string" },
        tabId: { type: "number" },
      },
    },
  },
  {
    name: "browser_extract",
    description:
      "Scrape text/attrs/links/tables when site scripts fail. Prefer over evaluate. Never reads cookies/storage.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number" },
        selector: { type: "string", description: "CSS selector (default headings/paragraphs)" },
        links: { type: "boolean", description: "Include links (default true)" },
        tables: { type: "boolean", description: "Include table grids" },
        attrs: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "browser_console",
    description:
      "Read recent page console messages (redacted). Protected — may include sensitive logs.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "browser_tab_focus",
    description: "Activate a claimed Perfect-group tab.",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number" } },
    },
  },
  {
    name: "browser_tab_close",
    description: "Close a claimed Perfect-group tab only (will not close arbitrary tabs).",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number" } },
    },
  },
  {
    name: "browser_drag",
    description:
      "Drag from fromRef to toRef with visible cursor (HTML5 drag + mouse). Snapshot both refs first.",
    inputSchema: {
      type: "object",
      properties: {
        fromRef: { type: "string" },
        toRef: { type: "string" },
        tabId: { type: "number" },
        label: { type: "string" },
      },
      required: ["fromRef", "toRef"],
    },
  },
  {
    name: "browser_upload",
    description:
      "Set files on input[type=file] by ref. Requires absolute local path(s). Protected — claimed tabs only.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        path: { type: "string", description: "Absolute file path" },
        paths: { type: "array", items: { type: "string" } },
        tabId: { type: "number" },
        label: { type: "string" },
      },
      required: ["ref"],
    },
  },
  {
    name: "browser_network",
    description:
      "Read-only recent network requests (URL redacted when sensitive). Protected — no interception/rewrite.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "browser_handle_dialog",
    description:
      "Accept or dismiss a pending JS alert/confirm/prompt (Page.handleJavaScriptDialog).",
    inputSchema: {
      type: "object",
      properties: {
        accept: { type: "boolean", description: "Default true" },
        promptText: { type: "string" },
        tabId: { type: "number" },
      },
    },
  },
  {
    name: "browser_evaluate",
    description:
      "Guarded JS evaluate (disabled patterns: cookies/storage). Prefer snapshot/extract/click/fill.",
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

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    return { tools };
  });

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
