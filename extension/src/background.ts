import { PROTOCOL_VERSION } from "./constants.js";
import {
  ensureToken,
  loadSettings,
  regenerateToken,
  saveSettings,
} from "./security.js";
import { runTool, resolvePermission, requestStop, getPendingPermission } from "./tools.js";
import * as cdp from "./cdp.js";

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let linked = false;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

function startKeepAlive(): void {
  if (keepAliveTimer) return;
  // MV3 kills the SW during long fills; light work keeps it awake while Linked
  keepAliveTimer = setInterval(() => {
    void chrome.storage.session.set({ perfectHeartbeat: Date.now() }).catch(() => {});
    // Also poke the bridge so idle links stay warm
    try {
      ws?.send(JSON.stringify({ type: "ping", t: Date.now() }));
    } catch {
      /* */
    }
  }, 10000);
}

function stopKeepAlive(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(() => {
  void ensureToken().then(() => connectLoop());
});

chrome.runtime.onStartup.addListener(() => {
  void ensureToken().then(() => connectLoop());
});

void ensureToken().then(() => connectLoop());

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "perfect_get_state") {
    void (async () => {
      const settings = await ensureToken();
      sendResponse({
        linked,
        settings,
        pendingPermission: getPendingPermission(),
      });
    })();
    return true;
  }
  if (msg?.type === "perfect_save_settings") {
    void saveSettings(msg.partial).then((s) => sendResponse({ ok: true, settings: s }));
    return true;
  }
  if (msg?.type === "perfect_regenerate_token") {
    void (async () => {
      const settings = await regenerateToken();
      linked = false;
      void connectLoop();
      sendResponse({ ok: true, settings });
    })();
    return true;
  }
  if (msg?.type === "perfect_permission_reply") {
    resolvePermission(msg.decision);
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "perfect_stop") {
    requestStop();
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "perfect_reconnect") {
    void connectLoop();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

async function connectLoop(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const settings = await loadSettings();
  if (!settings.token) {
    linked = false;
    broadcast({ type: "perfect_event", event: "disconnected" });
    reconnectTimer = setTimeout(() => void connectLoop(), 3000);
    return;
  }

  try {
    if (ws) {
      try {
        ws.close();
      } catch {
        /* */
      }
      ws = null;
    }
    ws = new WebSocket(`ws://127.0.0.1:${settings.wsPort}`);
    ws.addEventListener("open", () => {
      ws?.send(
        JSON.stringify({
          type: "hello",
          protocolVersion: PROTOCOL_VERSION,
          token: settings.token,
          role: "extension",
        }),
      );
    });
    ws.addEventListener("message", (ev) => {
      void onMessage(String(ev.data));
    });
    ws.addEventListener("close", () => {
      linked = false;
      stopKeepAlive();
      broadcast({ type: "perfect_event", event: "disconnected" });
      void cdp.detachAll();
      reconnectTimer = setTimeout(() => void connectLoop(), 2000);
    });
    ws.addEventListener("error", () => {
      /* close handler reconnects */
    });
  } catch {
    reconnectTimer = setTimeout(() => void connectLoop(), 3000);
  }
}

async function onMessage(raw: string): Promise<void> {
  let msg: {
    type: string;
    ok?: boolean;
    id?: string;
    tool?: string;
    args?: Record<string, unknown>;
    t?: number;
  };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg.type === "ping") {
    ws?.send(JSON.stringify({ type: "pong", t: (msg as { t?: number }).t ?? Date.now() }));
    return;
  }

  if (msg.type === "hello_ack") {
    linked = !!msg.ok;
    if (linked) startKeepAlive();
    else stopKeepAlive();
    broadcast({
      type: "perfect_event",
      event: linked ? "connected" : "disconnected",
    });
    return;
  }

  if (msg.type === "tool_request" && msg.id && msg.tool) {
    broadcast({
      type: "perfect_event",
      event: "tool_start",
      payload: { tool: msg.tool },
    });
    const result = await runTool(msg.tool, msg.args ?? {});
    ws?.send(
      JSON.stringify({
        type: "tool_response",
        id: msg.id,
        ok: result.ok,
        result: result.result,
        error: result.error,
        decision: result.decision,
        risk: result.risk,
      }),
    );
  }
}

function broadcast(msg: unknown): void {
  chrome.runtime.sendMessage(msg).catch(() => {});
}
