import * as cdp from "./cdp.js";
import * as tabs from "./tabs.js";
import {
  getRef,
  snapshot,
  focusRef,
  hoverRef,
  dragRef,
  nativeFillRef,
  resolveTarget,
  selectRef,
  extractFromPage,
  waitForCondition,
  annotateRefs,
  clearAnnotations,
  type SnapshotMode,
} from "./snapshot.js";
import {
  classify,
  hostFromUrl,
  loadSettings,
  saveSettings,
  siteAllowed,
  scanInjection,
  type PermissionDecision,
  type RiskLevel,
  type Settings,
} from "./security.js";

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

async function pushLog(tool: string, summary: string, ok = true): Promise<void> {
  if (ok) {
    await saveSettings({ actionLog: [] });
    void chrome.runtime
      .sendMessage({
        type: "perfect_event",
        event: "tool_end",
        payload: { tool, summary, ok: true },
      })
      .catch(() => {});
    return;
  }
  const s = await loadSettings();
  const actionLog = [
    { ts: Date.now(), tool, summary: `✗ ${summary}` },
    ...s.actionLog,
  ].slice(0, 12);
  await saveSettings({ actionLog });
  void chrome.runtime
    .sendMessage({
      type: "perfect_event",
      event: "tool_end",
      payload: { tool, summary, ok: false },
    })
    .catch(() => {});
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

  if (settings.mode === "skip" && settings.skipConfirmed && risk === "low") {
    await audit(tool, url, "allow_once", summary);
    return "allow_once";
  }

  if (risk === "low" && host && settings.alwaysAllowHosts.includes(host)) {
    await audit(tool, url, "always_allow_site", summary);
    return "allow_once";
  }

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

  if (stopped) clearStop();

  void chrome.storage.session.set({ perfectHeartbeat: Date.now() }).catch(() => {});

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
        const modeRaw = String(args.mode ?? "compact");
        const mode: SnapshotMode =
          modeRaw === "full" || modeRaw === "text" ? modeRaw : "compact";
        const snap = await snapshot(tabId, { mode });
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
        const fields = snap.nodes
          .filter((n) => n.editable)
          .map((n) =>
            n.value ? `${n.ref}\t${n.name}\t=${n.value}` : `${n.ref}\t${n.name}`,
          );
        const actions = snap.nodes
          .filter((n) => !n.editable && n.clickable)
          .slice(0, mode === "full" ? 80 : 40)
          .map((n) =>
            n.frame
              ? `${n.ref}\t${n.name}\tframe:${n.frame}`
              : n.dialog
                ? `${n.ref}\t${n.name}\tdialog`
                : `${n.ref}\t${n.name}`,
          );
        return {
          ok: true,
          result: {
            tabId: snap.tabId,
            url: snap.url,
            mode: snap.mode,
            fields,
            actions,
            frames: snap.frames,
            text: snap.text,
            inj: snap.injectionFlags,
          },
          decision,
        };
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
        return { ok: true, result: { tabId, ref, label, frame: info.frame }, decision, risk };
      }
      case "browser_hover": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const ref = String(args.ref);
        const info = getRef(ref);
        const label = String(args.label ?? info?.name ?? ref);
        const { risk } = classify({ tool, url: tab.url ?? "", label });
        const decision = await gate(tool, tab.url ?? "", `Hover ${label}`, risk, settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision, risk };
        }
        if (!info) return { ok: false, error: `Unknown ref ${ref}. Take a new snapshot.` };
        await showHud(tabId, true);
        const ok = await hoverRef(tabId, ref);
        if (!ok) {
          return { ok: false, error: `Could not hover ${label}`, decision, risk };
        }
        await pushLog(tool, `hover ${label}`);
        return { ok: true, result: { tabId, ref, label }, decision, risk };
      }
      case "browser_select": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const ref = String(args.ref);
        const value = String(args.value ?? "");
        const info = getRef(ref);
        const label = String(args.label ?? info?.name ?? ref);
        const { risk } = classify({ tool, url: tab.url ?? "", label, text: value });
        const decision = await gate(tool, tab.url ?? "", `Select ${label}`, risk, settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision, risk };
        }
        if (!info) return { ok: false, error: `Unknown ref ${ref}. Take a new snapshot.` };
        await showHud(tabId, true);
        const ok = await selectRef(tabId, ref, value);
        if (!ok) {
          return { ok: false, error: `Select failed on ${label}`, decision, risk };
        }
        await pushLog(tool, `select ${label}`);
        return { ok: true, result: { tabId, ref, value, label }, decision, risk };
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
        void chrome.storage.session.set({ perfectHeartbeat: Date.now() });

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

        void chrome.storage.session.set({ perfectHeartbeat: Date.now() });
        let filled = false;
        if (ref) {
          try {
            filled = await cdp.typeIntoRef(tabId, ref, text);
          } catch {
            filled = false;
          }
          if (!filled) {
            filled = await nativeFillRef(tabId, ref, text);
          }
        } else {
          try {
            await cdp.typeHuman(tabId, text);
            filled = true;
          } catch {
            filled = false;
          }
        }

        if (!filled) {
          return {
            ok: false,
            error: `Fill did not stick on "${fieldLabel}". Try a new snapshot.`,
            decision,
            risk,
          };
        }

        if (args.submit) {
          try {
            await cdp.delay(80);
            await cdp.pressKey(tabId, "Enter");
          } catch {
            /* ignore */
          }
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
              `window.scrollBy({ top: ${box.y - 200}, left: 0, behavior: 'instant' })`,
            );
          }
        } else {
          const dir = String(args.direction ?? "down");
          const amount = Number(args.amount ?? 3) * 100;
          const dy = dir === "up" ? -amount : dir === "down" ? amount : 0;
          const dx = dir === "left" ? -amount : dir === "right" ? amount : 0;
          await cdp.evaluate(
            tabId,
            `window.scrollBy({ top: ${dy}, left: ${dx}, behavior: 'instant' })`,
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

        let captions: string[] | undefined;
        const refsArg = args.refs;
        if (Array.isArray(refsArg) && refsArg.length) {
          const labels = Array.isArray(args.labels) ? (args.labels as string[]) : [];
          captions = await annotateRefs(
            tabId,
            refsArg.map((r, i) => ({
              ref: String(r),
              label: labels[i] != null ? String(labels[i]) : undefined,
            })),
          );
          await cdp.delay(80);
        }

        const clip =
          args.clip && typeof args.clip === "object"
            ? (args.clip as {
                x: number;
                y: number;
                width: number;
                height: number;
              })
            : undefined;
        const pngBase64 = await cdp.screenshotPng(tabId, {
          fullPage: !!args.fullPage,
          clip,
        });

        if (captions) await clearAnnotations(tabId);

        await showHud(tabId, true);
        await pushLog(tool, captions ? "screenshot annotated" : "screenshot");
        return {
          ok: true,
          result: {
            pngBase64,
            mimeType: "image/png",
            tabId,
            captions,
            suggestedFilename: `perfect-${tabId}-${Date.now()}.png`,
          },
          decision,
        };
      }
      case "browser_wait": {
        if (args.selector || args.urlIncludes) {
          const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
          const result = await waitForCondition(tabId, {
            selector: args.selector ? String(args.selector) : undefined,
            urlIncludes: args.urlIncludes ? String(args.urlIncludes) : undefined,
            timeoutMs: Number(args.timeoutMs ?? args.ms ?? 10000),
          });
          return {
            ok: result.ok,
            result,
            error: result.ok ? undefined : "Wait timed out",
          };
        }
        const ms = Math.min(Number(args.ms ?? 1000), 30000);
        await new Promise((r) => setTimeout(r, ms));
        return { ok: true, result: { waited: ms } };
      }
      case "browser_extract": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const decision = await gate(tool, tab.url ?? "", "extract", "low", settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision };
        }
        const data = await extractFromPage(tabId, {
          selector: args.selector ? String(args.selector) : undefined,
          links: args.links !== false,
          tables: !!args.tables,
          attrs: Array.isArray(args.attrs) ? (args.attrs as string[]) : undefined,
        });
        const inj = scanInjection(data.textSample);
        if (inj.length) {
          const injDecision = await gate(
            tool,
            tab.url ?? "",
            `Injection heuristic on extract: ${inj.join("; ")}`,
            "protected",
            settings,
          );
          if (injDecision === "deny" || injDecision === "prohibited") {
            return {
              ok: false,
              error: "Blocked due to possible prompt injection in page text",
              decision: injDecision,
              risk: "protected",
            };
          }
        }
        await pushLog(tool, `extract ${data.items.length} items`);
        return {
          ok: true,
          result: {
            tabId,
            items: data.items.slice(0, 150),
            links: data.links?.slice(0, 100),
            tables: data.tables,
            inj,
          },
          decision,
        };
      }
      case "browser_console": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const { risk } = classify({ tool, url: tab.url ?? "" });
        const decision = await gate(tool, tab.url ?? "", "console", risk, settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision, risk };
        }
        await cdp.enableConsole(tabId);
        try {
          await cdp.evaluate(tabId, "void 0");
        } catch {
          /* ignore */
        }
        const messages = cdp.getConsole(tabId, Number(args.limit ?? 40));
        await pushLog(tool, `console ${messages.length}`);
        return { ok: true, result: { tabId, messages }, decision, risk };
      }
      case "browser_tab_focus": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const decision = await gate(tool, tab.url ?? "", "tab focus", "low", settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision };
        }
        await tabs.focusClaimedTab(tabId);
        await pushLog(tool, `focus ${tabId}`);
        return { ok: true, result: { tabId } };
      }
      case "browser_tab_close": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const decision = await gate(tool, tab.url ?? "", "tab close", "low", settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision };
        }
        await tabs.closeClaimedTab(tabId);
        await pushLog(tool, `close ${tabId}`);
        return { ok: true, result: { closed: tabId } };
      }
      case "browser_drag": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const fromRef = String(args.fromRef ?? args.from);
        const toRef = String(args.toRef ?? args.to);
        const fromInfo = getRef(fromRef);
        const toInfo = getRef(toRef);
        const label = String(args.label ?? `${fromInfo?.name ?? fromRef} → ${toInfo?.name ?? toRef}`);
        const { risk } = classify({ tool, url: tab.url ?? "", label });
        const decision = await gate(tool, tab.url ?? "", `Drag ${label}`, risk, settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision, risk };
        }
        if (!fromInfo || !toInfo) {
          return { ok: false, error: "Unknown fromRef/toRef. Take a new snapshot." };
        }
        await showHud(tabId, true);
        const ok = await dragRef(tabId, fromRef, toRef);
        if (!ok) return { ok: false, error: `Drag failed: ${label}`, decision, risk };
        await pushLog(tool, `drag ${label}`);
        return { ok: true, result: { tabId, fromRef, toRef, label }, decision, risk };
      }
      case "browser_upload": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const ref = String(args.ref);
        const paths = Array.isArray(args.paths)
          ? (args.paths as string[])
          : args.path
            ? [String(args.path)]
            : [];
        const info = getRef(ref);
        const label = String(args.label ?? info?.name ?? ref);
        const { risk } = classify({ tool, url: tab.url ?? "", label });
        const decision = await gate(tool, tab.url ?? "", `Upload to ${label}`, risk, settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision, risk };
        }
        if (!info) return { ok: false, error: `Unknown ref ${ref}. Take a new snapshot.` };
        if (!paths.length) {
          return { ok: false, error: "Provide path or paths (absolute file path(s))" };
        }
        await showHud(tabId, true);
        await focusRef(tabId, ref);
        const ok = await cdp.setFileInputFiles(tabId, ref, paths);
        if (!ok) {
          return {
            ok: false,
            error: "Upload failed — ref must be input[type=file] after snapshot",
            decision,
            risk,
          };
        }
        await pushLog(tool, `upload ${label}`);
        return {
          ok: true,
          result: { tabId, ref, paths: paths.map((p) => p.split("/").pop()), count: paths.length },
          decision,
          risk,
        };
      }
      case "browser_network": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const { risk } = classify({ tool, url: tab.url ?? "" });
        const decision = await gate(tool, tab.url ?? "", "network", risk, settings);
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision, risk };
        }
        await cdp.enableNetwork(tabId);
        const requests = cdp.getNetwork(tabId, Number(args.limit ?? 40));
        await pushLog(tool, `network ${requests.length}`);
        return { ok: true, result: { tabId, requests }, decision, risk };
      }
      case "browser_handle_dialog": {
        const tabId = await tabs.resolveTabId(args.tabId as number | undefined);
        const tab = await chrome.tabs.get(tabId);
        const accept = args.accept !== false;
        const promptText = args.promptText != null ? String(args.promptText) : undefined;
        const pending = cdp.getPendingDialog(tabId);
        const { risk } = classify({
          tool,
          url: tab.url ?? "",
          text: promptText ?? pending?.message,
        });
        const decision = await gate(
          tool,
          tab.url ?? "",
          `dialog ${accept ? "accept" : "dismiss"}`,
          risk,
          settings,
        );
        if (decision === "deny" || decision === "prohibited") {
          return { ok: false, error: "Denied", decision, risk };
        }
        await cdp.armDialogListener(tabId);
        const ok = await cdp.handleJsDialog(tabId, accept, promptText);
        if (!ok && !pending) {
          return {
            ok: false,
            error: "No JavaScript dialog pending. Arm with a click that opens alert/confirm/prompt first.",
            decision,
            risk,
            result: { pending: null },
          };
        }
        await pushLog(tool, `dialog ${accept ? "accept" : "dismiss"}`);
        return {
          ok: true,
          result: { tabId, accept, handled: ok, was: pending },
          decision,
          risk,
        };
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
    const err = e instanceof Error ? e.message : String(e);
    await pushLog(tool, err, false);
    return { ok: false, error: err };
  }
}

async function showHud(tabId: number, show: boolean): Promise<void> {
  try {
    await ensureContent(tabId);
    await chrome.tabs.sendMessage(tabId, { type: "perfect_hud", show });
  } catch {
    /* restricted pages */
  }
}

async function showCursor(
  tabId: number,
  x: number,
  y: number,
  visible: boolean,
): Promise<void> {
  try {
    await ensureContent(tabId);
    await chrome.tabs.sendMessage(tabId, {
      type: "perfect_cursor",
      x,
      y,
      visible,
    });
  } catch {
    /* restricted pages */
  }
}

async function ensureContent(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "perfect_ping" });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
    } catch {
      /* chrome:// etc */
    }
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
