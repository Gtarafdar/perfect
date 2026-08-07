import { buildChatPrompt } from "./connect-snippet.js";

const DEFAULT_WS_PORT = 17321;
const copyHint = document.getElementById("copyHint")!;

async function ensureSettings(): Promise<{ token: string; wsPort: number }> {
  const data = await chrome.storage.local.get("settings");
  let settings = (data.settings ?? {}) as { token?: string; wsPort?: number };
  let token = settings.token ?? "";
  let wsPort = settings.wsPort || DEFAULT_WS_PORT;

  if (!token || token.length < 32) {
    const state = (await chrome.runtime.sendMessage({ type: "perfect_get_state" })) as
      | { settings?: { token?: string; wsPort?: number } }
      | undefined;
    token = state?.settings?.token ?? token;
    wsPort = state?.settings?.wsPort || wsPort;
  }

  return { token, wsPort };
}

document.getElementById("openPanel")!.addEventListener("click", async () => {
  try {
    const win = await chrome.windows.getCurrent();
    if (win.id != null) await chrome.sidePanel.open({ windowId: win.id });
    copyHint.textContent = "Side panel opened — copy the setup prompt there if needed.";
  } catch (e) {
    copyHint.textContent = `Open the Perfect side panel from the toolbar icon. (${String(e)})`;
  }
});

document.getElementById("copyPrompt")!.addEventListener("click", async () => {
  try {
    const { token, wsPort } = await ensureSettings();
    if (!token || token.length < 32) {
      copyHint.textContent = "Token not ready — open the side panel once, then try again.";
      return;
    }
    const text = buildChatPrompt({ token, wsPort, mode: "npm" });
    await navigator.clipboard.writeText(text);
    copyHint.textContent = "Setup prompt copied — paste it into Cursor.";
  } catch (e) {
    copyHint.textContent = `Copy failed: ${String(e)}`;
  }
});
