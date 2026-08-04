import { evaluateExpression, runInPage } from "./page.js";

const attached = new Set<number>();
const lastMouse = new Map<number, { x: number; y: number }>();

export type CursorSink = (tabId: number, x: number, y: number, visible: boolean) => void;

let cursorSink: CursorSink | null = null;

/** Optional hook so tools can drive the on-page cursor overlay. */
export function setCursorSink(sink: CursorSink | null): void {
  cursorSink = sink;
}

function isExtFrameConflict(e: unknown): boolean {
  return /chrome-extension:\/\/ URL of different extension/i.test(
    e instanceof Error ? e.message : String(e),
  );
}

export async function attach(tabId: number): Promise<void> {
  if (attached.has(tabId)) {
    try {
      // Probe — Chrome may have detached while our Set still thinks we're on
      await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
        expression: "1",
        returnByValue: true,
      });
      return;
    } catch {
      attached.delete(tabId);
    }
  }
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Another caller / prior SW may still hold the session
    if (!/already attached/i.test(msg)) throw e;
  }
  attached.add(tabId);
  await chrome.debugger.sendCommand({ tabId }, "Page.enable", {});
  await chrome.debugger.sendCommand({ tabId }, "Runtime.enable", {});
  await chrome.debugger.sendCommand({ tabId }, "DOM.enable", {});
}

export async function detach(tabId: number): Promise<void> {
  if (!attached.has(tabId)) return;
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    /* already detached */
  }
  attached.delete(tabId);
  lastMouse.delete(tabId);
}

export async function detachAll(): Promise<void> {
  await Promise.all([...attached].map((id) => detach(id)));
}

export async function send<T = unknown>(
  tabId: number,
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  try {
    return (await chrome.debugger.sendCommand(
      { tabId },
      method,
      params,
    )) as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/not attached|Detached while handling/i.test(msg)) {
      attached.delete(tabId);
      await attach(tabId);
      return (await chrome.debugger.sendCommand(
        { tabId },
        method,
        params,
      )) as T;
    }
    throw e;
  }
}

export async function screenshotPng(
  tabId: number,
  opts?: { fullPage?: boolean; clip?: { x: number; y: number; width: number; height: number; scale?: number } },
): Promise<string> {
  await attach(tabId);
  const params: Record<string, unknown> = {
    format: "png",
    fromSurface: true,
  };
  if (opts?.fullPage) params.captureBeyondViewport = true;
  if (opts?.clip) params.clip = opts.clip;
  const result = await send<{ data: string }>(tabId, "Page.captureScreenshot", params);
  return result.data;
}

const consoleBuf = new Map<number, Array<{ type: string; text: string; ts: number }>>();
const consoleListening = new Set<number>();

type NetEntry = {
  id: string;
  url: string;
  method: string;
  status?: number;
  type?: string;
  size?: number;
  ts: number;
};
const networkBuf = new Map<number, NetEntry[]>();
const networkListening = new Set<number>();
const networkMeta = new Map<string, { url: string; method: string; type?: string; tabId: number }>();

type PendingDialog = {
  tabId: number;
  type: string;
  message: string;
  defaultPrompt?: string;
  ts: number;
};
const pendingDialogs = new Map<number, PendingDialog>();

function pushConsole(tabId: number, type: string, text: string): void {
  const redacted = text
    .replace(/(api[_-]?key|token|password|secret)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .slice(0, 500);
  const list = consoleBuf.get(tabId) ?? [];
  list.push({ type, text: redacted, ts: Date.now() });
  consoleBuf.set(tabId, list.slice(-80));
}

function pushNetwork(tabId: number, entry: NetEntry): void {
  const list = networkBuf.get(tabId) ?? [];
  list.push(entry);
  networkBuf.set(tabId, list.slice(-100));
}

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (/token|key|secret|password|auth/i.test(u.search)) {
      u.search = "?[REDACTED]";
    }
    return u.toString().slice(0, 500);
  } catch {
    return url.slice(0, 500);
  }
}

/** Attach and start collecting console messages (read-only). */
export async function enableConsole(tabId: number): Promise<void> {
  await attach(tabId);
  if (consoleListening.has(tabId)) return;
  consoleListening.add(tabId);
  ensureDebuggerHooks();
}

export function getConsole(tabId: number, limit = 40): Array<{ type: string; text: string; ts: number }> {
  const list = consoleBuf.get(tabId) ?? [];
  return list.slice(-Math.min(Math.max(limit, 1), 80));
}

/** Enable Network domain and buffer requests (read-only). */
export async function enableNetwork(tabId: number): Promise<void> {
  await attach(tabId);
  await send(tabId, "Network.enable", {});
  networkListening.add(tabId);
  ensureDebuggerHooks();
}

export function getNetwork(
  tabId: number,
  limit = 40,
): NetEntry[] {
  const list = networkBuf.get(tabId) ?? [];
  return list.slice(-Math.min(Math.max(limit, 1), 100));
}

export function getPendingDialog(tabId: number): PendingDialog | null {
  return pendingDialogs.get(tabId) ?? null;
}

/** Accept or dismiss a JS alert/confirm/prompt. */
export async function handleJsDialog(
  tabId: number,
  accept: boolean,
  promptText?: string,
): Promise<boolean> {
  await attach(tabId);
  ensureDebuggerHooks();
  try {
    await send(tabId, "Page.handleJavaScriptDialog", {
      accept,
      ...(promptText != null ? { promptText } : {}),
    });
    pendingDialogs.delete(tabId);
    return true;
  } catch {
    return false;
  }
}

/** Arm Page domain so javascriptDialogOpening is captured. */
export async function armDialogListener(tabId: number): Promise<void> {
  await attach(tabId);
  await send(tabId, "Page.enable", {});
  ensureDebuggerHooks();
}

/**
 * Set files on a stamped file input via CDP DOM.setFileInputFiles.
 * paths must be absolute local file paths.
 */
export async function setFileInputFiles(
  tabId: number,
  ref: string,
  paths: string[],
): Promise<boolean> {
  if (!paths.length || paths.some((p) => !p || typeof p !== "string" || !p.startsWith("/"))) {
    throw new Error("Upload requires absolute file path(s)");
  }
  await attach(tabId);
  const safe = ref.replace(/[^a-zA-Z0-9_-]/g, "");
  const found = await evaluate<boolean>(
    tabId,
    `(() => {
      const find = (ref) => {
        let el = document.querySelector('[data-perfect-ref="' + ref + '"]');
        if (el) return el;
        for (const iframe of document.querySelectorAll('iframe')) {
          try {
            const doc = iframe.contentDocument;
            if (!doc) continue;
            el = doc.querySelector('[data-perfect-ref="' + ref + '"]');
            if (el) return el;
          } catch (_) {}
        }
        return null;
      };
      const el = find(${JSON.stringify(safe)});
      if (!el || el.tagName !== 'INPUT' || el.type !== 'file') return false;
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      return true;
    })()`,
  );
  if (!found) return false;

  const evalResult = await send<{
    result: { objectId?: string };
  }>(tabId, "Runtime.evaluate", {
    expression: `(() => {
      const find = (ref) => {
        let el = document.querySelector('[data-perfect-ref="' + ref + '"]');
        if (el) return el;
        for (const iframe of document.querySelectorAll('iframe')) {
          try {
            const doc = iframe.contentDocument;
            if (!doc) continue;
            el = doc.querySelector('[data-perfect-ref="' + ref + '"]');
            if (el) return el;
          } catch (_) {}
        }
        return null;
      };
      return find(${JSON.stringify(safe)});
    })()`,
    returnByValue: false,
  });
  const objectId = evalResult.result?.objectId;
  if (!objectId) return false;
  const node = await send<{ nodeId: number }>(tabId, "DOM.requestNode", { objectId });
  await send(tabId, "DOM.setFileInputFiles", {
    nodeId: node.nodeId,
    files: paths,
  });
  return true;
}

let debuggerHooked = false;
function ensureDebuggerHooks(): void {
  if (debuggerHooked) return;
  debuggerHooked = true;
  chrome.debugger.onEvent.addListener((source, method, params) => {
    const tabId = source.tabId;
    if (tabId == null) return;
    if (method === "Runtime.consoleAPICalled" && params) {
      const p = params as {
        type?: string;
        args?: Array<{ value?: unknown; description?: string }>;
      };
      const parts = (p.args ?? []).map((a) =>
        a.value != null ? String(a.value) : a.description ?? "",
      );
      pushConsole(tabId, p.type ?? "log", parts.join(" "));
    }
    if (method === "Runtime.exceptionThrown" && params) {
      const p = params as { exceptionDetails?: { text?: string; exception?: { description?: string } } };
      const text =
        p.exceptionDetails?.exception?.description ||
        p.exceptionDetails?.text ||
        "exception";
      pushConsole(tabId, "error", text);
    }
    if (method === "Network.requestWillBeSent" && params && networkListening.has(tabId)) {
      const p = params as {
        requestId: string;
        request: { url: string; method: string };
        type?: string;
      };
      networkMeta.set(p.requestId, {
        url: p.request.url,
        method: p.request.method,
        type: p.type,
        tabId,
      });
    }
    if (method === "Network.loadingFinished" && params && networkListening.has(tabId)) {
      const p = params as { requestId: string; encodedDataLength?: number };
      const meta = networkMeta.get(p.requestId);
      if (meta) {
        pushNetwork(tabId, {
          id: p.requestId,
          url: redactUrl(meta.url),
          method: meta.method,
          type: meta.type,
          size: p.encodedDataLength,
          ts: Date.now(),
        });
        networkMeta.delete(p.requestId);
      }
    }
    if (method === "Network.responseReceived" && params && networkListening.has(tabId)) {
      const p = params as {
        requestId: string;
        response: { status: number; url: string };
        type?: string;
      };
      const meta = networkMeta.get(p.requestId) ?? {
        url: p.response.url,
        method: "GET",
        type: p.type,
        tabId,
      };
      networkMeta.set(p.requestId, meta);
      const list = networkBuf.get(tabId) ?? [];
      const existing = list.find((e) => e.id === p.requestId);
      if (existing) {
        existing.status = p.response.status;
      } else {
        pushNetwork(tabId, {
          id: p.requestId,
          url: redactUrl(meta.url),
          method: meta.method,
          status: p.response.status,
          type: meta.type ?? p.type,
          ts: Date.now(),
        });
      }
    }
    if (method === "Page.javascriptDialogOpening" && params) {
      const p = params as {
        type: string;
        message: string;
        defaultPrompt?: string;
      };
      pendingDialogs.set(tabId, {
        tabId,
        type: p.type,
        message: String(p.message || "").slice(0, 500),
        defaultPrompt: p.defaultPrompt,
        ts: Date.now(),
      });
    }
    if (method === "Page.javascriptDialogClosed") {
      pendingDialogs.delete(tabId);
    }
  });
}

function notifyCursor(tabId: number, x: number, y: number, visible: boolean): void {
  // Throttle overlay updates — flooding tabs.sendMessage was dropping the SW/WS mid-fill
  const now = Date.now();
  const prev = lastCursorNotify.get(tabId);
  if (visible && prev && now - prev < 32) return;
  lastCursorNotify.set(tabId, now);
  cursorSink?.(tabId, x, y, visible);
}

const lastCursorNotify = new Map<number, number>();

/**
 * Move only the green overlay (no CDP Input). Animation runs in the content
 * script (one message) so the SW isn't flooded / killed mid-fill.
 */
export async function moveCursorOverlay(
  tabId: number,
  x: number,
  y: number,
  opts?: { steps?: number },
): Promise<void> {
  const from = lastMouse.get(tabId) ?? { x: x - 80, y: y - 60 };
  const dist = Math.hypot(x - from.x, y - from.y);
  const durationMs = Math.max(140, Math.min(400, 160 + dist * 0.2));
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "perfect_cursor_animate",
      x,
      y,
      fromX: from.x,
      fromY: from.y,
      durationMs,
    });
  } catch {
    // Content script missing — fall back to instant place via sink
    lastCursorNotify.delete(tabId);
    notifyCursor(tabId, x, y, true);
  }
  lastMouse.set(tabId, { x, y });
  void opts;
}

/**
 * Prefer overlay-only mouse (silent). CDP Input only when explicitly needed later.
 */
export async function moveMouse(
  tabId: number,
  x: number,
  y: number,
  opts?: { steps?: number },
): Promise<void> {
  await moveCursorOverlay(tabId, x, y, opts);
}

export async function clickAt(tabId: number, x: number, y: number): Promise<void> {
  await moveCursorOverlay(tabId, x, y);
  await delay(20 + Math.random() * 30);
  lastMouse.set(tabId, { x, y });
  await delay(25 + Math.random() * 35);
}

/**
 * Type into a stamped field inside ONE page script (delays run in-page).
 * Keeps the MV3 service worker alive — no per-keystroke round trips.
 */
export async function typeIntoRef(
  tabId: number,
  ref: string,
  text: string,
): Promise<boolean> {
  const safeRef = ref.replace(/[^a-zA-Z0-9_-]/g, "");
  return runInPage(
    tabId,
    async (r: string, value: string) => {
      const find = (ref: string) => {
        let el = document.querySelector(
          `[data-perfect-ref="${ref}"]`,
        ) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (el) return el;
        for (const iframe of document.querySelectorAll("iframe")) {
          try {
            const doc = iframe.contentDocument;
            if (!doc) continue;
            el = doc.querySelector(
              `[data-perfect-ref="${ref}"]`,
            ) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
            if (el) return el;
          } catch {
            /* cross-origin */
          }
        }
        return null;
      };
      const el = find(r);
      if (!el) return false;
      el.focus();
      const tag = el.tagName;
      if (tag === "SELECT") {
        (el as HTMLSelectElement).value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return (el as HTMLSelectElement).value === value;
      }
      const proto =
        tag === "TEXTAREA"
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      const setVal = (v: string) => {
        if (desc?.set) desc.set.call(el, v);
        else (el as HTMLInputElement).value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      setVal("");
      // Short values type out; longer type a prefix then commit (still looks human)
      const typeLen = Math.min(value.length, 24);
      for (let i = 0; i < typeLen; i++) {
        setVal(value.slice(0, i + 1));
        await new Promise((res) => setTimeout(res, 10 + Math.random() * 16));
      }
      if (typeLen < value.length) setVal(value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return String((el as HTMLInputElement).value ?? "") === value;
    },
    [safeRef, text],
  );
}

/**
 * Type into the focused field in ONE page script (no per-key SW round trips).
 */
export async function typeHuman(tabId: number, text: string): Promise<void> {
  await runInPage(
    tabId,
    async (value: string) => {
      const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el || !("value" in el)) return false;
      const proto =
        el.tagName === "TEXTAREA"
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      const setVal = (v: string) => {
        if (desc?.set) desc.set.call(el, v);
        else el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const start = String(el.value || "");
      const typeLen = Math.min(value.length, 24);
      for (let i = 0; i < typeLen; i++) {
        setVal(start + value.slice(0, i + 1));
        await new Promise((res) => setTimeout(res, 10 + Math.random() * 16));
      }
      setVal(start + value);
      return true;
    },
    [text],
  );
}

/** @deprecated Prefer typeIntoRef / typeHuman */
export async function insertText(tabId: number, text: string): Promise<void> {
  await typeHuman(tabId, text);
}

/** Soft key handling via page script — no debugger attach. */
export async function pressKey(tabId: number, key: string): Promise<void> {
  const lower = key.toLowerCase();
  if (lower === "meta+a" || lower === "ctrl+a") {
    await evaluateExpression(
      tabId,
      `(() => { const el = document.activeElement; if (el && 'select' in el) try { el.select(); } catch (_) {} return true; })()`,
    );
    return;
  }
  if (lower === "backspace") {
    await evaluateExpression(
      tabId,
      `(() => {
        const el = document.activeElement;
        if (!el || !('value' in el)) return false;
        const proto = el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, ''); else el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`,
    );
    return;
  }
  if (lower === "enter") {
    await evaluateExpression(
      tabId,
      `(() => {
        const el = document.activeElement;
        if (!el) return false;
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        if (el.form) el.form.requestSubmit?.();
        return true;
      })()`,
    );
    return;
  }
  // Other keys: try CDP once; ignore extension-frame conflicts
  try {
    await attach(tabId);
    const parts = key.split("+").map((p) => p.trim());
    const main = parts[parts.length - 1]!;
    let modifiers = 0;
    for (const p of parts.slice(0, -1)) {
      const l = p.toLowerCase();
      if (l === "alt") modifiers |= 1;
      if (l === "ctrl" || l === "control") modifiers |= 2;
      if (l === "meta" || l === "cmd" || l === "command") modifiers |= 4;
      if (l === "shift") modifiers |= 8;
    }
    const keyInfo =
      KEY_MAP[main] ?? {
        key: main,
        code: `Key${main.toUpperCase()}`,
        windowsVirtualKeyCode: main.toUpperCase().charCodeAt(0),
      };
    await send(tabId, "Input.dispatchKeyEvent", {
      type: "keyDown",
      modifiers,
      ...keyInfo,
    });
    await delay(30 + Math.random() * 40);
    await send(tabId, "Input.dispatchKeyEvent", {
      type: "keyUp",
      modifiers,
      ...keyInfo,
    });
  } catch (e) {
    if (!isExtFrameConflict(e)) throw e;
  }
}

/**
 * Prefer scripting (silent, no debugger banner / extension-frame conflicts).
 * Fall back to CDP only if scripting is blocked (rare chrome:// pages).
 */
export async function evaluate<T>(tabId: number, expression: string): Promise<T> {
  try {
    return await evaluateExpression<T>(tabId, expression);
  } catch (scriptErr) {
    try {
      await attach(tabId);
      const result = await send<{
        result: { value?: T; exceptionDetails?: unknown };
      }>(tabId, "Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.result.exceptionDetails) {
        throw new Error("Evaluate failed");
      }
      return result.result.value as T;
    } catch (cdpErr) {
      if (isExtFrameConflict(cdpErr)) {
        throw new Error(
          "Page evaluate blocked by another extension’s frames. Disable conflicting extensions on this tab, or retry.",
        );
      }
      throw scriptErr instanceof Error ? scriptErr : cdpErr;
    }
  }
}

export async function scrollWheel(
  tabId: number,
  direction: string,
  amount: number,
): Promise<void> {
  await attach(tabId);
  const pos = lastMouse.get(tabId) ?? { x: 200, y: 200 };
  const delta = amount * 100;
  let deltaX = 0;
  let deltaY = 0;
  if (direction === "down") deltaY = delta;
  if (direction === "up") deltaY = -delta;
  if (direction === "right") deltaX = delta;
  if (direction === "left") deltaX = -delta;
  await send(tabId, "Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: pos.x,
    y: pos.y,
    deltaX,
    deltaY,
  });
}

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const KEY_MAP: Record<
  string,
  { key: string; code: string; windowsVirtualKeyCode?: number }
> = {
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 },
};
