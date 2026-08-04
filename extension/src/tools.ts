import * as cdp from "./cdp.js";
import * as tabs from "./tabs.js";
import { getRef, snapshot, focusRef, readRefValue, nativeFillRef, resolveTarget } from "./snapshot.js";
import {
  classify,
  hostFromUrl,
  loadSettings,
  saveSettings,
  siteAllowed,
  type PermissionDecision,
  type RiskLevel,
  type Settings,
} from "./security.js";

// Drive the on-page cursor overlay from CDP mouse moves
cdp.setCursorSink((tabId, x, y, visible) => {
  void showCursor(tabId, x, y, visible);
});

export type ToolResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
  decision?: PermissionDecision;
  risk?: RiskLevel;
};

let stopped = false;
let pendingPermission:
  | {
      resolve: (d: PermissionDecision) => void;
      prompt: {
        id: string;
        tool: string;
        url: string;
        host: string;
        summary: string;
        risk: RiskLevel;
      };
    }
  | null = null;

export function isStopped(): boolean {
  return stopped;
}

export function requestStop(): void {
  stopped = true;
  void cdp.detachAll();
  void chrome.runtime.sendMessage({ type: "perfect_event", event: "stopped" }).catch(() => {});
}

export function clearStop(): void {
  stopped = false;
}

export function resolvePermission(decision: PermissionDecision): void {
  if (pendingPermission) {
    pendingPermission.resolve(decision);
    pendingPermission = null;
  }
}

export function getPendingPermission() {
  return pendingPermission?.prompt ?? null;
}

async function pushLog(tool: string, summary: string): Promise<void> {
  const s = await loadSettings();
  const actionLog = [{ ts: Date.now(), tool, summary }, ...s.actionLog].slice(0, 40);
  await saveSettings({ actionLog });
  void chrome.runtime.sendMessage({
    type: "perfect_event",
    event: "tool_end",
    payload: { tool, summary },
  }).catch(() => {});
}

async function audit(
  tool: string,
  url: string,
  decision: PermissionDecision,
  summary: string,
): Promise<void> {
  const s = await loadSettings();
  const entry = { ts: Date.now(), tool, url, decision, summary };
  await saveSettings({ audit: [entry, ...s.audit].slice(0, 200) });
}

async function waitForPermission(prompt: {
  id: string;
  tool: string;
  url: string;
  host: string;
  summary: string;
  risk: RiskLevel;
}): Promise<PermissionDecision> {
  await chrome.storage.local.set({ pendingPermission: prompt });
  void chrome.runtime.sendMessage({ type: "perfect_event", event: "permission", payload: prompt }).catch(() => {});
  try {
    await chrome.sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id });
  } catch {
    /* may fail without user gesture */
  }

  return new Promise((resolve) => {
    pendingPermission = { resolve, prompt };
  });
}

async function gate(
  tool: string,
  url: string,
  summary: string,
  risk: RiskLevel,
  settings: Settings,
): Promise<PermissionDecision> {
  const host = hostFromUrl(url);

  if (risk === "prohibited") {
    await audit(tool, url, "prohibited", summary);
    return "prohibited";
  }

  const site = siteAllowed(host, settings);
  if (!site.ok) {
    await audit(tool, url, "deny", site.reason ?? "blocked");
    return "deny";
  }

  // Skip: no prompts for low risk (still confirm protected; prohibited already returned)
  if (settings.mode === "skip" && settings.skipConfirmed && risk === "low") {
    await audit(tool, url, "allow_once", summary);
    return "allow_once";
  }

  // Always-allow site + low risk → no prompt in any mode
  if (risk === "low" && host && settings.alwaysAllowHosts.includes(host)) {
    await audit(tool, url, "always_allow_site", summary);
    return "allow_once";
  }

  // Auto: allow low-risk on first visit only after one grant; otherwise prompt
  // (falls through to prompt for new hosts and protected actions)

  const decision = await waitForPermission({
    id: `${Date.now()}`,
    tool,
    url,
    host,
    summary,
    risk,
  });

  if (decision === "always_allow_site" && host) {
    const s = await loadSettings();
    if (!s.alwaysAllowHosts.includes(host)) {
      await saveSettings({ alwaysAllowHosts: [...s.alwaysAllowHosts, host] });
    }
  }

  await audit(tool, url, decision, summary);
  await chrome.storage.local.remove("pendingPermission");
  return decision;
}

export async function runTool(
  tool: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  if (tool === "browser_stop") {
    requestStop();
    return { ok: true, result: { stopped: true } };
  }

  // Stop is a one-shot cancel — next real tool resumes work
  if (stopped) clearStop();

  const settings = await loadSettings();

  try {
    switch (tool) {
      case "browser_status": {
        return {
          ok: true,
          result: {
            mode: settings.mode,
            claimedTabs: tabs.getClaimed(),
            pendingPermission: getPendingPermission(),
            alwaysAllowHosts: settings.alwaysAllowHosts,
            allowlistOnly: settings.allowlistOnly,
          },
        };
      }
      case "browser_tabs": {
        const list = await tabs.listTabs(!!args.all);
        return { ok: true, result: list };
      }
      case "browser_propose_plan": {
        const sites = args.sites as string[];
        const approach = String(args.approach ?? "");
        const decision = await waitForPermission({
          id: `plan-${Date.now()}`,
          tool,
          url: sites[0] ? `https://${sites[0]}` : "",
          host: sites[0] ?? "",
          summary: `Plan: ${approach} on ${sites.join(", ")}`,
          risk: "protected",
        });
        if (decision === "deny") {
          return { ok: false, error: "Plan denied", decision };
        }
        await saveSettings({
          approvedPlan: { sites, approach, ts: Date.now() },
          alwaysAllowHosts: [
            ...new Set([
              ...settings.alwaysAllowHosts,
              ...sites.map((s) => s.replace(/^https?:\/\//, "").split("/")[0]!),
            ]),
          ],
        });
        await chrome.storage.local.remove("pendingPermission");
        return { ok: true, result: { approved: true, sites, approach }, decision };
      }
      case "browser_navigate": {
        const url = String(args.url);
        const { risk, reasons } = classify({ tool, url });
        const decision = await gate(tool, url, `Navigate ${url} (${reasons.join(",")})`, risk, settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: decision === "prohibited" ? "Prohibited" : "Denied", decision, risk };
        }
        // Reuse claimed tab by default — only spawn a new tab when newTab=true
        const tabId = await tabs.navigateClaimed(url, {
          tabId: args.tabId as number | undefined,
          newTab: !!args.newTab,
        });
        await waitForTabLoad(tabId);
        await showHud(tabId, true);
        await pushLog(tool, `navigate ${url}`);
        return { ok: true, result: { tabId, url }, decision, risk };
      }
      case "browser_back":
      case "browser_forward": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const decision = await gate(tool, tab.url ?? "", tool, "low", settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision };
        }
        await cdp.send(tabId, "Page.enable", {});
        if (tool === "browser_back") await chrome.tabs.goBack(tabId);
        else await chrome.tabs.goForward(tabId);
        await pushLog(tool, tool);
        return { ok: true, result: { tabId } };
      }
      case "browser_snapshot": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const decision = await gate(tool, tab.url ?? "", "snapshot", "low", settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision };
        }
        const snap = await snapshot(tabId);
        if (snap.injectionFlags.length) {
          const injDecision = await gate(
            tool,
            tab.url ?? "",
            `Injection heuristic: ${snap.injectionFlags.join("; ")}`,
            "protected",
            settings,
          );
          if (injDecision === "deny" || injDecision === "prohibited") {
            return {
              ok: false,
              error: "Blocked due to possible prompt injection on page",
              decision: injDecision,
              risk: "protected",
              result: snap,
            };
          }
        }
        await pushLog(tool, `snapshot ${snap.nodes.length} nodes`);
        await showHud(tabId, true);
        return { ok: true, result: snap, decision };
      }
      case "browser_click": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const ref = String(args.ref);
        const info = getRef(ref);
        const label = String(args.label ?? info?.name ?? ref);
        const { risk, reasons } = classify({ tool, url: tab.url ?? "", label });
        const decision = await gate(tool, tab.url ?? "", `Click ${label}`, risk, settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: risk === "prohibited" ? "Prohibited action" : "Denied", decision, risk };
        }
        if (!info) return { ok: false, error: `Unknown ref ${ref}. Take a new snapshot.` };
        await showHud(tabId, true);
        const ok = await focusRef(tabId, ref);
        if (!ok) {
          return {
            ok: false,
            error: `Could not focus ${label} (${ref}). Take a new snapshot.`,
            decision,
            risk,
          };
        }
        await pushLog(tool, `click ${label} (${reasons.join(",")})`);
        return { ok: true, result: { tabId, ref, label }, decision, risk };
      }
      case "browser_fill":
      case "browser_type": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const text = String(args.value ?? args.text ?? "");
        const ref = args.ref ? String(args.ref) : undefined;
        const inputType = args.inputType ? String(args.inputType) : undefined;
        const info = ref ? getRef(ref) : undefined;
        const fieldLabel = String(args.label ?? info?.name ?? ref ?? "focus");
        const { risk } = classify({
          tool,
          url: tab.url ?? "",
          text,
          inputType,
          label: fieldLabel,
        });
        const decision = await gate(
          tool,
          tab.url ?? "",
          `${tool} "${fieldLabel}"`,
          risk,
          settings,
        );
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision, risk };
        }
        await showHud(tabId, true);
        if (ref) {
          if (!info) return { ok: false, error: `Unknown ref ${ref}. Take a new snapshot.` };
          const focused = await focusRef(tabId, ref);
          if (!focused) {
            return {
              ok: false,
              error: `Could not focus "${fieldLabel}" (${ref}). Snapshot again.`,
              decision,
              risk,
            };
          }
        }

        // Visible cursor already landed on the field. Prefer reliable fill:
        // short values type out; longer values use native set after focus so the
        // MV3 service worker doesn't die mid-keystroke and drop Linked.
        if (tool === "browser_fill") {
          await cdp.pressKey(tabId, "Meta+a");
          await cdp.delay(25);
          await cdp.pressKey(tabId, "Backspace");
          await cdp.delay(30);
        }

        if (text.length <= 12) {
          await cdp.typeHuman(tabId, text);
        } else if (ref) {
          // Type a short prefix so it still looks human, then commit the rest
          const prefix = text.slice(0, 4);
          await cdp.typeHuman(tabId, prefix);
          await nativeFillRef(tabId, ref, text);
        } else {
          await cdp.typeHuman(tabId, text);
        }

        if (ref && tool === "browser_fill") {
          await cdp.delay(30);
          const got = await readRefValue(tabId, ref);
          if (got !== text) {
            const rescued = await nativeFillRef(tabId, ref, text);
            if (!rescued) {
              return {
                ok: false,
                error: `Fill did not stick on "${fieldLabel}" (got ${JSON.stringify(got)}). Try a new snapshot.`,
                decision,
                risk,
              };
            }
          }
        }

        if (args.submit) {
          await cdp.delay(80);
          await cdp.pressKey(tabId, "Enter");
        }
        await pushLog(tool, `${tool} ${fieldLabel}`);
        return {
          ok: true,
          result: { tabId, ref, label: fieldLabel },
          decision,
          risk,
        };
      }
      case "browser_press": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const key = String(args.key);
        const decision = await gate(tool, tab.url ?? "", `press ${key}`, "low", settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision };
        }
        await cdp.pressKey(tabId, key);
        await pushLog(tool, `press ${key}`);
        return { ok: true, result: { tabId, key } };
      }
      case "browser_scroll": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const decision = await gate(tool, tab.url ?? "", "scroll", "low", settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision };
        }
        if (args.ref) {
          const box = await resolveTarget(tabId, String(args.ref));
          if (box) {
            await cdp.evaluate(
              tabId,
              `window.scrollBy({ top: ${box.y - 200}, left: 0, behavior: 'smooth' })`,
            );
          }
        } else {
          await cdp.scrollWheel(
            tabId,
            String(args.direction ?? "down"),
            Number(args.amount ?? 3),
          );
        }
        await pushLog(tool, "scroll");
        return { ok: true, result: { tabId } };
      }
      case "browser_screenshot": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const decision = await gate(tool, tab.url ?? "", "screenshot", "protected", settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision, risk: "protected" };
        }
        await showHud(tabId, false);
        await showCursor(tabId, 0, 0, false);
        const pngBase64 = await cdp.screenshotPng(tabId);
        await showHud(tabId, true);
        await pushLog(tool, "screenshot");
        return { ok: true, result: { pngBase64, mimeType: "image/png", tabId }, decision };
      }
      case "browser_wait": {
        const ms = Math.min(Number(args.ms ?? 1000), 30000);
        await new Promise((r) => setTimeout(r, ms));
        return { ok: true, result: { waited: ms } };
      }
      case "browser_evaluate": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const expression = String(args.expression);
        const { risk } = classify({ tool, url: tab.url ?? "", code: expression });
        const decision = await gate(tool, tab.url ?? "", "evaluate", risk, settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision, risk };
        }
        const value = await cdp.evaluate(tabId, expression);
        await pushLog(tool, "evaluate");
        return { ok: true, result: { value }, decision, risk };
      }
      default:
        return { ok: false, error: `Unknown tool: ${tool}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    // Detach after each tool to reduce debugger banner time
    if (tool !== "browser_status" && tool !== "browser_stop") {
      /* keep attached briefly for multi-step; detachAll on stop/disconnect */
    }
  }
}

async function showHud(tabId: number, show: boolean): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "perfect_hud", show });
  } catch {
    /* content script may be missing on restricted pages */
  }
}

async function showCursor(
  tabId: number,
  x: number,
  y: number,
  visible: boolean,
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "perfect_cursor",
      x,
      y,
      visible,
    });
  } catch {
    /* content script may be missing */
  }
}

async function waitForTabLoad(tabId: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const t = await chrome.tabs.get(tabId);
      if (t.status === "complete") {
        await cdp.delay(350 + Math.random() * 250);
        return;
      }
    } catch {
      return;
    }
    await cdp.delay(120);
  }
}
