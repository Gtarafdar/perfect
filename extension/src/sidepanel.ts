type State = {
  linked: boolean;
  settings: {
    token: string;
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

async function refresh(): Promise<void> {
  const state = (await chrome.runtime.sendMessage({
    type: "perfect_get_state",
  })) as State;
  render(state);
}

function render(state: State): void {
  statusCard.classList.toggle("linked", state.linked);
  statusLabel.textContent = state.linked ? "Linked to Cursor" : "Waiting for MCP";
  statusSub.textContent = state.linked
    ? "Bridge live · actions appear below"
    : "Start Perfect MCP in Cursor, then paste token";
  if (state.settings.token && !tokenInput.value) {
    tokenInput.value = state.settings.token;
  }
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

document.getElementById("saveToken")!.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({
    type: "perfect_save_settings",
    partial: { token: tokenInput.value.trim() },
  });
  await chrome.runtime.sendMessage({ type: "perfect_reconnect" });
  await refresh();
});

modeSelect.addEventListener("change", async () => {
  const mode = modeSelect.value;
  if (mode === "skip") {
    const ok = confirm(
      "Skip mode lets Perfect act as you with almost no prompts. Prohibited actions still block. Type confirmation OK only if you understand the risk.",
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

document.getElementById("copyConfig")!.addEventListener("click", async () => {
  const snippet = `{
  "mcpServers": {
    "perfect": {
      "command": "npx",
      "args": ["-y", "@perfect/mcp"]
    }
  }
}`;
  await navigator.clipboard.writeText(snippet);
  statusSub.textContent = "MCP config copied";
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "perfect_event") void refresh();
});

void refresh();
setInterval(() => void refresh(), 2000);
