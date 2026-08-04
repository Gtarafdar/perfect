const attached = new Set<number>();
const lastMouse = new Map<number, { x: number; y: number }>();

export type CursorSink = (tabId: number, x: number, y: number, visible: boolean) => void;

let cursorSink: CursorSink | null = null;

/** Optional hook so tools can drive the on-page cursor overlay. */
export function setCursorSink(sink: CursorSink | null): void {
  cursorSink = sink;
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

export async function screenshotPng(tabId: number): Promise<string> {
  await attach(tabId);
  const result = await send<{ data: string }>(tabId, "Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  return result.data;
}

function notifyCursor(tabId: number, x: number, y: number, visible: boolean): void {
  cursorSink?.(tabId, x, y, visible);
}

/**
 * Smooth human-like mouse move (cubic bezier + jitter), then update overlay.
 */
export async function moveMouse(
  tabId: number,
  x: number,
  y: number,
  opts?: { steps?: number },
): Promise<void> {
  await attach(tabId);
  const from = lastMouse.get(tabId) ?? { x: x - 80, y: y - 60 };
  const dist = Math.hypot(x - from.x, y - from.y);
  const steps = opts?.steps ?? Math.max(12, Math.min(36, Math.round(dist / 18)));

  const cp1 = {
    x: from.x + (x - from.x) * 0.25 + (Math.random() - 0.5) * 40,
    y: from.y + (y - from.y) * 0.1 + (Math.random() - 0.5) * 50,
  };
  const cp2 = {
    x: from.x + (x - from.x) * 0.75 + (Math.random() - 0.5) * 40,
    y: from.y + (y - from.y) * 0.9 + (Math.random() - 0.5) * 50,
  };

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // ease-in-out
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const px =
      (1 - e) ** 3 * from.x +
      3 * (1 - e) ** 2 * e * cp1.x +
      3 * (1 - e) * e ** 2 * cp2.x +
      e ** 3 * x;
    const py =
      (1 - e) ** 3 * from.y +
      3 * (1 - e) ** 2 * e * cp1.y +
      3 * (1 - e) * e ** 2 * cp2.y +
      e ** 3 * y;
    const jx = px + (Math.random() - 0.5) * 1.5;
    const jy = py + (Math.random() - 0.5) * 1.5;
    await send(tabId, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: jx,
      y: jy,
    });
    notifyCursor(tabId, jx, jy, true);
    await delay(8 + Math.random() * 14);
  }

  await send(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  notifyCursor(tabId, x, y, true);
  lastMouse.set(tabId, { x, y });
}

export async function clickAt(tabId: number, x: number, y: number): Promise<void> {
  await moveMouse(tabId, x, y);
  await delay(80 + Math.random() * 120);
  await send(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await delay(40 + Math.random() * 60);
  await send(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  lastMouse.set(tabId, { x, y });
  await delay(120 + Math.random() * 100);
}

/**
 * Type like a person: per-character insert with variable delay.
 * Occasional slightly longer pauses (thinking / looking at the field).
 */
export async function typeHuman(tabId: number, text: string): Promise<void> {
  await attach(tabId);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    await send(tabId, "Input.insertText", { text: ch });
    let ms = 35 + Math.random() * 55;
    if (ch === " " || ch === "@" || ch === "." || ch === ",") ms += 40 + Math.random() * 80;
    if (i > 0 && i % (7 + Math.floor(Math.random() * 5)) === 0) {
      ms += 120 + Math.random() * 180;
    }
    await delay(ms);
  }
}

/** @deprecated Prefer typeHuman for visible fills */
export async function insertText(tabId: number, text: string): Promise<void> {
  await typeHuman(tabId, text);
}

export async function pressKey(tabId: number, key: string): Promise<void> {
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
}

export async function evaluate<T>(tabId: number, expression: string): Promise<T> {
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
