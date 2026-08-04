const attached = new Set<number>();

export async function attach(tabId: number): Promise<void> {
  if (attached.has(tabId)) return;
  await chrome.debugger.attach({ tabId }, "1.3");
  attached.add(tabId);
  await send(tabId, "Page.enable", {});
  await send(tabId, "Runtime.enable", {});
  await send(tabId, "DOM.enable", {});
}

export async function detach(tabId: number): Promise<void> {
  if (!attached.has(tabId)) return;
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    /* already detached */
  }
  attached.delete(tabId);
}

export async function detachAll(): Promise<void> {
  await Promise.all([...attached].map((id) => detach(id)));
}

export async function send<T = unknown>(
  tabId: number,
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  return chrome.debugger.sendCommand({ tabId }, method, params) as Promise<T>;
}

export async function screenshotPng(tabId: number): Promise<string> {
  await attach(tabId);
  const result = await send<{ data: string }>(tabId, "Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  return result.data;
}

export async function clickAt(tabId: number, x: number, y: number): Promise<void> {
  await attach(tabId);
  await send(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
  });
  await delay(40);
  await send(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await send(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}

export async function insertText(tabId: number, text: string): Promise<void> {
  await attach(tabId);
  for (const ch of text) {
    await send(tabId, "Input.insertText", { text: ch });
  }
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
  const keyInfo = KEY_MAP[main] ?? { key: main, code: `Key${main.toUpperCase()}`, keyCode: main.toUpperCase().charCodeAt(0) };
  await send(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    modifiers,
    ...keyInfo,
  });
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
  const delta = amount * 100;
  let deltaX = 0;
  let deltaY = 0;
  if (direction === "down") deltaY = delta;
  if (direction === "up") deltaY = -delta;
  if (direction === "right") deltaX = delta;
  if (direction === "left") deltaX = -delta;
  await send(tabId, "Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: 200,
    y: 200,
    deltaX,
    deltaY,
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const KEY_MAP: Record<string, { key: string; code: string; windowsVirtualKeyCode?: number }> = {
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 },
};
