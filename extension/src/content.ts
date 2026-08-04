const ROOT_ID = "perfect-agent-hud";

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
    `;
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(el);
    el.querySelector(".perfect-hud-stop")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "perfect_stop" });
    });
  }
  return el;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "perfect_hud") {
    const el = ensureHud();
    el.classList.toggle("show", !!msg.show);
  }
});
