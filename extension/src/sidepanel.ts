import { buildChatPrompt, buildConnectJson } from "./connect-snippet.js";

type State = {
  linked: boolean;
  settings: {
    token: string;
    wsPort: number;
    mode: string;
    actionLog: Array<{ ts: number; tool: string; summary: string }>;
    skipConfirmed?: boolean;
  };
  pendingPermission: {
    summary: string;
    host: string;
    tool: string;
    risk: string;
  } | null;
};

const statusCard = document.getElementById("statusCard")!;
const statusLabel = document.getElementById("statusLabel")!;
const statusSub = document.getElementById("statusSub")!;
const tokenInput = document.getElementById("token") as HTMLInputElement;
const modeSelect = document.getElementById("mode") as HTMLSelectElement;
const ticker = document.getElementById("ticker")!;
const permissionBox = document.getElementById("permissionBox")!;
const permSummary = document.getElementById("permSummary")!;
const permMeta = document.getElementById("permMeta")!;
const setupBox = document.getElementById("setupBox")!;
const copyHint = document.getElementById("copyHint")!;
const devServerPath = document.getElementById("devServerPath") as HTMLInputElement;

let cached: State | null = null;
let lastRenderKey = "";
/** Don't flash setup UI on brief disconnect blips while reconnecting */
let linkedStickyUntil = 0;
/** Once we've been Linked this panel session, keep setup hidden during blips */
let everLinked = false;
let refreshInFlight: Promise<void> | null = null;

function snippetOpts(state: State) {
  const path = devServerPath.value.trim();
  if (path) {
    return {
      token: state.settings.token,
      wsPort: state.settings.wsPort || 17321,
      mode: "node" as const,
      serverPath: path,
    };
  }
  return {
    token: state.settings.token,
    wsPort: state.settings.wsPort || 17321,
    mode: "github" as const,
  };
}

function stateKey(state: State): string {
  return JSON.stringify({
    linked: state.linked,
    mode: state.settings.mode,
    token: Boolean(state.settings.token),
    log: state.settings.actionLog ?? [],
    perm: state.pendingPermission,
  });
}

async function refresh(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const state = (await chrome.runtime.sendMessage({
        type: "perfect_get_state",
      })) as State | undefined;
      if (!state?.settings) return;

      // Sticky linked: ignore false blips for 30s (reconnect happens in background)
      if (state.linked) {
        linkedStickyUntil = Date.now() + 30000;
        everLinked = true;
      } else if (Date.now() < linkedStickyUntil) {
        state.linked = true;
      }

      const key = stateKey(state);
      if (key === lastRenderKey) {
        cached = state;
        return;
      }
      lastRenderKey = key;
      cached = state;
      render(state);
    } catch {
      /* SW restarting — skip; next event/poll will catch up */
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function render(state: State): void {
  statusCard.classList.toggle("linked", state.linked);
  statusLabel.textContent = state.linked ? "Linked to Cursor" : "Waiting for Cursor MCP";
  statusSub.textContent = state.linked
    ? "Bridge live · errors stay below"
    : "Paste the setup prompt in Cursor — I’ll handle the rest";

  setupBox.hidden = state.linked || everLinked;
  if (!tokenInput.value && state.settings.token) {
    tokenInput.value = "••••••••••••••••";
  }

  if (modeSelect.value !== (state.settings.mode || "manual")) {
    modeSelect.value = state.settings.mode || "manual";
  }

  const rows = state.settings.actionLog ?? [];
  const nextTicker =
    rows.length === 0
      ? state.linked
        ? "Ready — errors stay here; successes clear"
        : "Waiting…"
      : rows.map((r) => `${r.summary.startsWith("✗") ? "err|" : ""}${r.tool} · ${r.summary}`).join("\n");

  if (ticker.dataset.sig !== nextTicker) {
    ticker.dataset.sig = nextTicker;
    ticker.innerHTML = "";
    if (rows.length === 0) {
      const li = document.createElement("li");
      li.className = "ticker-empty";
      li.textContent = state.linked
        ? "Ready — errors stay here; successes clear"
        : "Waiting…";
      ticker.appendChild(li);
    } else {
      for (const row of rows) {
        const li = document.createElement("li");
        li.className = row.summary.startsWith("✗") ? "err" : "";
        li.textContent = `${row.tool} · ${row.summary}`;
        ticker.appendChild(li);
      }
    }
  }

  if (state.pendingPermission) {
    permissionBox.hidden = false;
    permSummary.textContent = state.pendingPermission.summary;
    permMeta.textContent = `${state.pendingPermission.tool} · ${state.pendingPermission.host} · ${state.pendingPermission.risk}`;
  } else {
    permissionBox.hidden = true;
  }
}

async function ensureState(): Promise<State | null> {
  if (!cached?.settings.token) await refresh();
  if (!cached?.settings.token) {
    statusSub.textContent = "Token not ready — reopen the panel";
    return null;
  }
  return cached;
}

document.getElementById("copyPrompt")!.addEventListener("click", async () => {
  const state = await ensureState();
  if (!state) return;
  const text = buildChatPrompt(snippetOpts(state));
  await navigator.clipboard.writeText(text);
  copyHint.textContent = "Copied — paste into a new Cursor chat now";
  statusSub.textContent = "Prompt copied — paste in Cursor";
});

document.getElementById("copyConnect")!.addEventListener("click", async () => {
  const state = await ensureState();
  if (!state) return;
  const text = buildConnectJson(snippetOpts(state));
  await navigator.clipboard.writeText(text);
  statusSub.textContent = "Raw MCP JSON copied (Advanced)";
});

document.getElementById("regenToken")!.addEventListener("click", async () => {
  const ok = confirm(
    "Regenerate bridge token? Cursor will disconnect until you copy the setup prompt again.",
  );
  if (!ok) return;
  await chrome.runtime.sendMessage({ type: "perfect_regenerate_token" });
  lastRenderKey = "";
  await refresh();
  statusSub.textContent = "New token minted — copy setup prompt again";
});

modeSelect.addEventListener("change", async () => {
  const mode = modeSelect.value;
  if (mode === "skip") {
    const ok = confirm(
      "Skip mode lets Perfect act as you with almost no prompts. Prohibited actions still block. Continue only if you understand the risk.",
    );
    if (!ok) {
      modeSelect.value = "manual";
      return;
    }
    await chrome.runtime.sendMessage({
      type: "perfect_save_settings",
      partial: { mode, skipConfirmed: true },
    });
  } else {
    await chrome.runtime.sendMessage({
      type: "perfect_save_settings",
      partial: { mode, skipConfirmed: false },
    });
  }
  lastRenderKey = "";
  await refresh();
});

document.getElementById("allowOnce")!.addEventListener("click", () => {
  chrome.runtime.sendMessage({
    type: "perfect_permission_reply",
    decision: "allow_once",
  });
  setTimeout(() => {
    lastRenderKey = "";
    void refresh();
  }, 200);
});

document.getElementById("allowSite")!.addEventListener("click", () => {
  chrome.runtime.sendMessage({
    type: "perfect_permission_reply",
    decision: "always_allow_site",
  });
  setTimeout(() => {
    lastRenderKey = "";
    void refresh();
  }, 200);
});

document.getElementById("deny")!.addEventListener("click", () => {
  chrome.runtime.sendMessage({
    type: "perfect_permission_reply",
    decision: "deny",
  });
  setTimeout(() => {
    lastRenderKey = "";
    void refresh();
  }, 200);
});

function flashHud(message: string): void {
  ticker.dataset.sig = `flash:${message}:${Date.now()}`;
  ticker.innerHTML = "";
  const li = document.createElement("li");
  li.textContent = message;
  ticker.appendChild(li);
  statusSub.textContent = message;
}

document.getElementById("stopBtn")!.addEventListener("click", () => {
  flashHud("Stop sent — cancelling in-flight actions…");
  chrome.runtime.sendMessage({ type: "perfect_stop" }, (resp) => {
    flashHud(
      chrome.runtime.lastError
        ? `Stop failed: ${chrome.runtime.lastError.message}`
        : "Stopped — debugger detached",
    );
  });
});

document.getElementById("reconnect")!.addEventListener("click", async () => {
  flashHud("Reconnecting to Cursor MCP…");
  try {
    const resp = (await chrome.runtime.sendMessage({
      type: "perfect_reconnect",
    })) as { ok?: boolean; alreadyLinked?: boolean } | undefined;
    flashHud(
      resp?.alreadyLinked
        ? "Already linked — pinged bridge"
        : "Reconnect requested — waiting for Linked…",
    );
  } catch (e) {
    flashHud(`Reconnect failed: ${String(e)}`);
  }
  lastRenderKey = "";
  await refresh();
});

// Only re-render on events that change UI — ignore tool_start spam
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "perfect_event") return;
  const ev = msg.event as string;
  if (ev === "tool_start") return;
  // Silent reconnect: don't thrash UI on disconnected while sticky/everLinked
  if (ev === "disconnected" && (everLinked || Date.now() < linkedStickyUntil)) {
    return;
  }
  if (ev === "connected") {
    everLinked = true;
    linkedStickyUntil = Date.now() + 30000;
    lastRenderKey = "";
    void refresh();
    return;
  }
  if (ev === "tool_end" && msg.payload?.ok === true) {
    lastRenderKey = "";
    void refresh();
    return;
  }
  if (ev === "permission" || ev === "stopped" || ev === "tool_end" || ev === "disconnected") {
    lastRenderKey = "";
    void refresh();
  }
});

void refresh();
// Rare health check only — was 2s and caused the green flash
setInterval(() => void refresh(), 15000);
