const ROOT_ID = "perfect-agent-hud";
const CURSOR_ID = "perfect-agent-cursor";

let cursorAnim: number | null = null;
let cursorPos = { x: 0, y: 0 };

function ensureHud(): HTMLElement {
  let el = document.getElementById(ROOT_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = ROOT_ID;
    el.innerHTML = `
      <div class="perfect-hud-pill">
        <span class="perfect-hud-dot"></span>
        <span class="perfect-hud-label">Perfect</span>
        <button type="button" class="perfect-hud-stop" aria-label="Stop">Stop</button>
      </div>
    `;
    const style = document.createElement("style");
    style.textContent = `
      #${ROOT_ID} {
        position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
        font-family: ui-sans-serif, system-ui, sans-serif;
        opacity: 0; pointer-events: none; transform: translateY(8px);
        transition: opacity .2s ease, transform .2s ease;
      }
      #${ROOT_ID}.show { opacity: 1; pointer-events: auto; transform: none; }
      .perfect-hud-pill {
        display: flex; align-items: center; gap: 10px;
        background: #0A0B0A; color: #F4F7F0; border: 1px solid #2A2E28;
        border-radius: 999px; padding: 8px 10px 8px 14px;
        box-shadow: 0 12px 40px rgba(0,0,0,.45);
      }
      .perfect-hud-dot {
        width: 8px; height: 8px; border-radius: 50%; background: #B8FF3C;
      }
      .perfect-hud-label { font-size: 12px; letter-spacing: .04em; font-weight: 600; }
      .perfect-hud-stop {
        border: 0; border-radius: 999px; padding: 6px 12px; cursor: pointer;
        background: #B8FF3C; color: #0A0B0A; font-weight: 700; font-size: 12px;
      }
      .perfect-hud-stop:hover { filter: brightness(1.05); }
      #${CURSOR_ID} {
        position: fixed; left: 0; top: 0; width: 24px; height: 24px;
        z-index: 2147483646; pointer-events: none; opacity: 0;
        transform: translate(-2px, -2px);
        transition: opacity .12s ease;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,.35));
      }
      #${CURSOR_ID}.show { opacity: 1; }
    `;
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(el);
    el.querySelector(".perfect-hud-stop")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "perfect_stop" });
    });
  }
  return el;
}

function ensureCursor(): HTMLElement {
  ensureHud();
  let el = document.getElementById(CURSOR_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = CURSOR_ID;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 3L4 19L9.2 14.5L12.5 21.2L14.8 20.1L11.4 13.2L18 13L4 3Z"
          fill="#B8FF3C" stroke="#0A0B0A" stroke-width="1.2" stroke-linejoin="round"/>
      </svg>
    `;
    document.documentElement.appendChild(el);
  }
  return el;
}

function placeCursor(x: number, y: number, visible = true): void {
  const el = ensureCursor();
  cursorPos = { x, y };
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.classList.toggle("show", visible);
}

/** Smooth bezier move entirely in the page — one SW message, no flood. */
function animateCursorTo(
  toX: number,
  toY: number,
  fromX?: number,
  fromY?: number,
  durationMs = 280,
): Promise<void> {
  return new Promise((resolve) => {
    if (cursorAnim != null) cancelAnimationFrame(cursorAnim);
    const el = ensureCursor();
    el.classList.add("show");
    const from = {
      x: fromX ?? cursorPos.x ?? toX - 80,
      y: fromY ?? cursorPos.y ?? toY - 60,
    };
    const dist = Math.hypot(toX - from.x, toY - from.y);
    const dur = Math.max(120, Math.min(420, durationMs + dist * 0.15));
    const cp1 = {
      x: from.x + (toX - from.x) * 0.3 + (Math.random() - 0.5) * 24,
      y: from.y + (toY - from.y) * 0.2 + (Math.random() - 0.5) * 28,
    };
    const cp2 = {
      x: from.x + (toX - from.x) * 0.7 + (Math.random() - 0.5) * 24,
      y: from.y + (toY - from.y) * 0.8 + (Math.random() - 0.5) * 28,
    };
    const t0 = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const x =
        (1 - e) ** 3 * from.x +
        3 * (1 - e) ** 2 * e * cp1.x +
        3 * (1 - e) * e ** 2 * cp2.x +
        e ** 3 * toX;
      const y =
        (1 - e) ** 3 * from.y +
        3 * (1 - e) ** 2 * e * cp1.y +
        3 * (1 - e) * e ** 2 * cp2.y +
        e ** 3 * toY;
      placeCursor(x, y, true);
      if (t < 1) {
        cursorAnim = requestAnimationFrame(tick);
      } else {
        cursorAnim = null;
        placeCursor(toX, toY, true);
        resolve();
      }
    };
    cursorAnim = requestAnimationFrame(tick);
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "perfect_ping") {
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "perfect_hud") {
    const el = ensureHud();
    el.classList.toggle("show", !!msg.show);
  }
  if (msg?.type === "perfect_cursor") {
    if (msg.visible === false) {
      const el = ensureCursor();
      el.classList.remove("show");
      return false;
    }
    placeCursor(Number(msg.x) || 0, Number(msg.y) || 0, true);
    return false;
  }
  if (msg?.type === "perfect_cursor_animate") {
    void animateCursorTo(
      Number(msg.x) || 0,
      Number(msg.y) || 0,
      msg.fromX != null ? Number(msg.fromX) : undefined,
      msg.fromY != null ? Number(msg.fromY) : undefined,
      Number(msg.durationMs) || 280,
    ).then(() => sendResponse({ ok: true }));
    return true; // async response
  }
  return false;
});
