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
    mode: "npx" as const,
  };
}

async function refresh(): Promise<void> {
  const state = (await chrome.runtime.sendMessage({
    type: "perfect_get_state",
  })) as State;
  cached = state;
  render(state);
}

function render(state: State): void {
  statusCard.classList.toggle("linked", state.linked);
  statusLabel.textContent = state.linked ? "Linked to Cursor" : "Waiting for Cursor MCP";
  statusSub.textContent = state.linked
    ? "Bridge live · actions appear below"
    : "Paste the setup prompt in Cursor — I’ll handle the rest";

  setupBox.hidden = state.linked;
  tokenInput.value = state.settings.token ? "••••••••••••••••" : "";

  modeSelect.value = state.settings.mode || "manual";
  ticker.innerHTML = "";
  for (const row of state.settings.actionLog ?? []) {
    const li = document.createElement("li");
    li.textContent = `${row.tool} · ${row.summary}`;
    ticker.appendChild(li);
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
  await refresh();
});

document.getElementById("allowOnce")!.addEventListener("click", () => {
  chrome.runtime.sendMessage({
    type: "perfect_permission_reply",
    decision: "allow_once",
  });
  setTimeout(() => void refresh(), 200);
});

document.getElementById("allowSite")!.addEventListener("click", () => {
  chrome.runtime.sendMessage({
    type: "perfect_permission_reply",
    decision: "always_allow_site",
  });
  setTimeout(() => void refresh(), 200);
});

document.getElementById("deny")!.addEventListener("click", () => {
  chrome.runtime.sendMessage({
    type: "perfect_permission_reply",
    decision: "deny",
  });
  setTimeout(() => void refresh(), 200);
});

document.getElementById("stopBtn")!.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "perfect_stop" });
});

document.getElementById("reconnect")!.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "perfect_reconnect" });
  await refresh();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "perfect_event") void refresh();
});

void refresh();
setInterval(() => void refresh(), 2000);
