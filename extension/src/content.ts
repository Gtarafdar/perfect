const ROOT_ID = "perfect-agent-hud";
const CURSOR_ID = "perfect-agent-cursor";

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
        box-shadow: 0 0 0 0 rgba(184,255,60,.6);
        animation: perfectPulse 1.6s ease infinite;
      }
      @keyframes perfectPulse {
        0% { box-shadow: 0 0 0 0 rgba(184,255,60,.55); }
        70% { box-shadow: 0 0 0 10px rgba(184,255,60,0); }
        100% { box-shadow: 0 0 0 0 rgba(184,255,60,0); }
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
    // Classic pointer shape (green accent tip)
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

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "perfect_hud") {
    const el = ensureHud();
    el.classList.toggle("show", !!msg.show);
  }
  if (msg?.type === "perfect_cursor") {
    const el = ensureCursor();
    if (msg.visible === false) {
      el.classList.remove("show");
      return;
    }
    el.style.left = `${Number(msg.x) || 0}px`;
    el.style.top = `${Number(msg.y) || 0}px`;
    el.classList.add("show");
  }
});
