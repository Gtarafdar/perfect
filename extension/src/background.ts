import { PROTOCOL_VERSION } from "./constants.js";
import {
  ensureToken,
  regenerateToken,
  saveSettings,
} from "./security.js";
import { runTool, resolvePermission, requestStop, getPendingPermission } from "./tools.js";
import * as cdp from "./cdp.js";
import { shouldOpenWelcome } from "./welcome-gate.js";

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let linked = false;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
/** Bumps on each new socket so stale close handlers don't schedule reconnect loops */
let socketGen = 0;
/** Back off when MCP isn't listening — stops Chrome error-page spam */
let failStreak = 0;

function startKeepAlive(): void {
  if (keepAliveTimer) return;
  // MV3 kills the SW during long fills; light work keeps it awake while Linked
  keepAliveTimer = setInterval(() => {
    void chrome.storage.session.set({ perfectHeartbeat: Date.now() }).catch(() => {});
    try {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping", t: Date.now() }));
      }
    } catch {
      /* */
    }
  }, 4000);
}

function stopKeepAlive(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    await ensureToken();
    void connectLoop();
    const currentVersion = chrome.runtime.getManifest().version;
    const stored = await chrome.storage.local.get("welcomeSeenVersion");
    const welcomeSeenVersion =
      typeof stored.welcomeSeenVersion === "string"
        ? stored.welcomeSeenVersion
        : undefined;
    if (
      shouldOpenWelcome({
        reason: details.reason,
        currentVersion,
        welcomeSeenVersion,
      })
    ) {
      await chrome.tabs.create({
        url: chrome.runtime.getURL("welcome.html"),
      });
      await chrome.storage.local.set({ welcomeSeenVersion: currentVersion });
    }
  })();
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
      void connectLoop({ force: true });
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
    // Already Linked — don't tear down (avoids ERR_CONNECTION_REFUSED flash)
    if (linked && ws && ws.readyState === WebSocket.OPEN) {
      failStreak = 0;
      try {
        ws.send(JSON.stringify({ type: "ping", t: Date.now() }));
      } catch {
        /* */
      }
      sendResponse({ ok: true, alreadyLinked: true });
      return false;
    }
    failStreak = 0;
    void connectLoop({ force: true });
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

/**
 * Connect to MCP bridge.
 * force=false (default): no-op if already open/connecting — prevents the
 * close→schedule→close flash loop.
 */
async function connectLoop(opts?: { force?: boolean }): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const force = !!opts?.force;
  if (
    !force &&
    ws &&
    (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  // ensureToken (not loadSettings) — always defined after SW boot; mints token if missing
  const settings = await ensureToken();
  if (!settings.token) {
    linked = false;
    broadcast({ type: "perfect_event", event: "disconnected" });
    reconnectTimer = setTimeout(() => void connectLoop(), 3000);
    return;
  }

  try {
    const gen = ++socketGen;
    const prev = ws;
    ws = null;
    if (prev) {
      try {
        prev.close();
      } catch {
        /* */
      }
    }

    const socket = new WebSocket(`ws://127.0.0.1:${settings.wsPort}`);
    ws = socket;
    socket.addEventListener("open", () => {
      if (gen !== socketGen || ws !== socket) return;
      failStreak = 0;
      socket.send(
        JSON.stringify({
          type: "hello",
          protocolVersion: PROTOCOL_VERSION,
          token: settings.token,
          role: "extension",
        }),
      );
    });
    socket.addEventListener("message", (ev) => {
      if (gen !== socketGen || ws !== socket) return;
      void onMessage(String(ev.data));
    });
    socket.addEventListener("close", () => {
      // Ignore closes from sockets we intentionally replaced
      if (gen !== socketGen || ws !== socket) return;
      linked = false;
      ws = null;
      stopKeepAlive();
      broadcast({ type: "perfect_event", event: "disconnected" });
      void cdp.detachAll();
      failStreak += 1;
      // After several refusals, pause auto-retry — Chrome logs every failed WS.
      // User (or MCP coming back + Reconnect) resumes.
      if (failStreak >= 6) {
        return;
      }
      // 2s, 3s, 4.5s … cap 20s — fewer ERR_CONNECTION_REFUSED while MCP is down
      const delayMs = Math.min(20_000, Math.round(2000 * Math.pow(1.5, Math.min(failStreak - 1, 6))));
      reconnectTimer = setTimeout(() => void connectLoop(), delayMs);
    });
    socket.addEventListener("error", () => {
      /* close handler reconnects */
    });
  } catch {
    failStreak += 1;
    const delayMs = Math.min(20_000, Math.round(3000 * Math.pow(1.5, Math.min(failStreak - 1, 6))));
    reconnectTimer = setTimeout(() => void connectLoop(), delayMs);
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
    const prev = linked;
    linked = !!msg.ok;
    if (linked) {
      failStreak = 0;
      startKeepAlive();
    } else stopKeepAlive();
    // Only broadcast when link state actually changes — stops UI thrash
    if (prev !== linked) {
      broadcast({
        type: "perfect_event",
        event: linked ? "connected" : "disconnected",
      });
    }
    return;
  }

  if (msg.type === "tool_request" && msg.id && msg.tool) {
    // Don't broadcast tool_start — it forced the side panel to re-render every action
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
    return;
  }
}

function broadcast(msg: unknown): void {
  chrome.runtime.sendMessage(msg).catch(() => {});
}
