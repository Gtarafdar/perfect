(() => {
  const prompts = [
    {
      label: "Snapshot",
      text: "Using Perfect: open https://example.com, take a snapshot, and tell me the main heading.",
      tools: ["browser_navigate", "browser_wait", "browser_snapshot"],
      caption: "Quiet smoke — navigate, wait, read the tree.",
    },
    {
      label: "YouTube play",
      text: 'Using Perfect: search YouTube for “Saiyaara song”, open the official YRF title track, and play it.',
      tools: ["browser_navigate", "browser_wait", "browser_press"],
      caption: "Heavy SPAs: prefer navigate + wait + press k when snapshot is flaky.",
    },
    {
      label: "Form fill",
      text: "Using Perfect: open a form page I provide, snapshot the fields, fill the first name with PerfectSmoke, and confirm the value.",
      tools: ["browser_navigate", "browser_snapshot", "browser_fill"],
      caption: "Live R&D — same cookies, Manual approvals, visible Perfect group.",
    },
  ];

  const shots = [
    {
      src: "screenshots/welcome.png",
      alt: "Perfect welcome page with connect steps",
      caption: "First-run welcome — unofficial disclaimer, connect steps, safety notes.",
    },
    {
      src: "screenshots/linked.png",
      alt: "Perfect side panel Linked to Cursor",
      caption: "Linked bridge — Manual mode, Action HUD Stop, Reconnect without tear-down.",
    },
    {
      src: "screenshots/agent-work.png",
      alt: "Perfect agent work in Chrome",
      caption: "Agent work stays visible in the Perfect tab group while you keep the desk.",
      fallback: "screenshots/linked.png",
    },
  ];

  const promptBox = document.getElementById("promptBox");
  const toolRow = document.getElementById("toolRow");
  const copyHint = document.getElementById("copyHint");
  const picker = document.querySelectorAll(".prompt-picker button");
  let promptIndex = 0;
  let typeTimer = null;
  let toolTimer = null;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function renderTools(tools, active = -1) {
    if (!toolRow) return;
    toolRow.innerHTML = tools
      .map(
        (t, i) =>
          `<span class="tool-chip${i === active ? " is-on" : ""}">${t}</span>`,
      )
      .join("");
  }

  function typePrompt(entry) {
    if (!promptBox) return;
    if (typeTimer) window.clearInterval(typeTimer);
    if (toolTimer) window.clearInterval(toolTimer);
    renderTools(entry.tools, -1);

    if (reduceMotion) {
      promptBox.textContent = entry.text;
      renderTools(entry.tools, entry.tools.length - 1);
      return;
    }

    let i = 0;
    promptBox.innerHTML = '<span class="cursor" aria-hidden="true"></span>';
    typeTimer = window.setInterval(() => {
      i += 1;
      promptBox.innerHTML =
        escapeHtml(entry.text.slice(0, i)) +
        '<span class="cursor" aria-hidden="true"></span>';
      if (i >= entry.text.length) {
        window.clearInterval(typeTimer);
        let step = 0;
        toolTimer = window.setInterval(() => {
          renderTools(entry.tools, step);
          step += 1;
          if (step >= entry.tools.length) window.clearInterval(toolTimer);
        }, 420);
      }
    }, 12);
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  picker.forEach((btn) => {
    btn.addEventListener("click", () => {
      picker.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      promptIndex = Number(btn.getAttribute("data-prompt") || 0);
      typePrompt(prompts[promptIndex]);
      if (copyHint) copyHint.textContent = "";
    });
  });

  document.getElementById("copyPrompt")?.addEventListener("click", async () => {
    const text = prompts[promptIndex].text;
    try {
      await navigator.clipboard.writeText(text);
      if (copyHint) copyHint.textContent = "Copied — paste into Cursor after Linked.";
    } catch {
      if (copyHint) copyHint.textContent = "Copy failed — select the prompt text manually.";
    }
  });

  typePrompt(prompts[0]);

  /* Feature stack */
  const stackImg = document.getElementById("stackImg");
  const stackCaption = document.getElementById("stackCaption");
  const stackBtns = document.querySelectorAll("#stackSteps button");

  function showShot(index) {
    const shot = shots[index] || shots[0];
    if (!stackImg || !stackCaption) return;
    stackImg.onerror = () => {
      if (shot.fallback) stackImg.src = shot.fallback;
    };
    stackImg.src = shot.src;
    stackImg.alt = shot.alt;
    stackCaption.textContent = shot.caption;
    stackBtns.forEach((b, i) => b.classList.toggle("is-active", i === index));
  }

  stackBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      showShot(Number(btn.getAttribute("data-shot") || 0));
    });
  });

  /* Reveal */
  const reveals = document.querySelectorAll(".reveal");
  if (reduceMotion) {
    reveals.forEach((el) => el.classList.add("is-in"));
  } else if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
  }

  /* Support email copy */
  const copyBtn = document.getElementById("copyEmail");
  const copyEmailHint = document.getElementById("copyEmailHint");
  copyBtn?.addEventListener("click", () => {
    const email = copyBtn.getAttribute("data-email") || "";
    const idle = "Click to copy";
    function ok() {
      if (copyEmailHint) copyEmailHint.textContent = "Copied";
      copyBtn.classList.add("is-copied");
      window.setTimeout(() => {
        if (copyEmailHint) copyEmailHint.textContent = idle;
        copyBtn.classList.remove("is-copied");
      }, 1600);
    }
    function fail() {
      if (copyEmailHint) copyEmailHint.textContent = "Copy failed — " + email;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(email).then(ok).catch(fail);
    } else {
      try {
        const ta = document.createElement("textarea");
        ta.value = email;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        ok();
      } catch {
        fail();
      }
    }
  });

  /* Scroll-driven bridge: line draw + liquid circle fills */
  const bridge = document.querySelector("[data-bridge]");
  const hero = document.querySelector(".hero");
  if (bridge && hero) {
    const path = bridge.querySelector(".path");
    const liquids = [...bridge.querySelectorAll("[data-liquid]")];
    const cores = [...bridge.querySelectorAll("[data-core]")];
    const nodes = [...bridge.querySelectorAll(".node")];
    const labels = [...bridge.querySelectorAll("text")];
    const thresholds = [0.08, 0.48, 0.92];
    let raf = 0;
    let waveT = 0;
    let lastProgress = -1;

    function liquidPath(cx, halfW, topY, bottomY, phase) {
      const amp = 2.2;
      const y1 = topY + Math.sin(phase) * amp;
      const y2 = topY + Math.sin(phase + 1.1) * amp;
      const y3 = topY + Math.sin(phase + 2.2) * amp;
      return `M${cx - halfW} ${bottomY} V${y1} Q${cx - halfW / 2} ${y2 - 2} ${cx} ${y2} T${cx + halfW} ${y3} V${bottomY} Z`;
    }

    function paint(progress, phase) {
      if (path) path.style.strokeDashoffset = String(100 - progress * 100);

      liquids.forEach((el, i) => {
        const local = Math.min(1, Math.max(0, (progress - thresholds[i]) / 0.22));
        const cx = i === 0 ? 48 : i === 1 ? 210 : 372;
        const halfW = i === 1 ? 16 : 14;
        const bottom = i === 1 ? 54 : 52;
        const top = bottom - local * (i === 1 ? 32 : 28);
        el.setAttribute("d", liquidPath(cx, halfW, top, bottom, phase + i * 0.9));
        el.style.opacity = local > 0.02 ? "1" : "0";
        nodes[i]?.classList.toggle("is-lit", local > 0.35);
        cores[i]?.classList.toggle("is-on", local > 0.55);
        labels[i]?.classList.toggle("is-lit", local > 0.45);
      });
    }

    function measureProgress() {
      const rect = hero.getBoundingClientRect();
      const span = Math.max(rect.height * 0.7, 240);
      return Math.min(1, Math.max(0, -rect.top / span));
    }

    function frame() {
      raf = 0;
      const progress = measureProgress();
      const waving = progress > thresholds[0] && progress < 1.001;
      if (waving) waveT += 0.09;
      if (Math.abs(progress - lastProgress) > 0.002 || waving) {
        lastProgress = progress;
        paint(progress, waveT);
      }
      if (waving) raf = window.requestAnimationFrame(frame);
    }

    function kick() {
      if (reduceMotion) {
        paint(1, 0);
        return;
      }
      if (!raf) raf = window.requestAnimationFrame(frame);
    }

    if (reduceMotion) {
      paint(1, 0);
    } else {
      paint(0, 0);
      window.addEventListener("scroll", kick, { passive: true });
      window.addEventListener("resize", kick, { passive: true });
      kick();
    }
  }
})();
