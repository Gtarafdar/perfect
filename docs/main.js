(() => {
  const prompts = [
    {
      label: "Snapshot",
      text: "Using Perfect: open https://example.com, take a snapshot, and tell me the main heading.",
      tools: ["browser_navigate", "browser_wait", "browser_snapshot"],
    },
    {
      label: "YouTube play",
      text: 'Using Perfect: search YouTube for “Saiyaara song”, open the official YRF title track, and play it.',
      tools: ["browser_navigate", "browser_wait", "browser_press"],
    },
    {
      label: "Form fill",
      text: "Using Perfect: open a form page I provide, snapshot the fields, fill the first name with PerfectSmoke, and confirm the value.",
      tools: ["browser_navigate", "browser_snapshot", "browser_fill"],
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
  const picker = [...document.querySelectorAll(".prompt-picker button")];
  const demoSection = document.getElementById("demo");
  const stackSection = document.getElementById("capabilities");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let promptIndex = 0;
  let typeTimer = null;
  let toolTimer = null;
  let demoHoldTimer = null;
  let demoGen = 0;
  let demoAuto = !reduceMotion;
  let demoVisible = false;
  let demoRunning = false;

  function clearDemoTimers() {
    demoGen += 1;
    if (typeTimer) window.clearInterval(typeTimer);
    if (toolTimer) window.clearInterval(toolTimer);
    if (demoHoldTimer) window.clearTimeout(demoHoldTimer);
    typeTimer = toolTimer = demoHoldTimer = null;
    demoRunning = false;
  }

  function renderTools(tools, active = -1) {
    if (!toolRow) return;
    toolRow.innerHTML = tools
      .map(
        (t, i) =>
          `<span class="tool-chip${i === active ? " is-on" : ""}">${t}</span>`,
      )
      .join("");
  }

  function paintPromptStatic(index) {
    if (!promptBox) return;
    const entry = prompts[index] || prompts[0];
    promptIndex = index;
    promptBox.textContent = entry.text;
    renderTools(entry.tools, entry.tools.length - 1);
    setPicker(index, 0);
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function clearTabProgress(buttons) {
    buttons.forEach((b) => {
      const bar = b.querySelector(".tab-progress");
      if (!bar) return;
      bar.classList.remove("is-running");
      bar.style.animationDuration = "";
    });
  }

  function runTabProgress(btn, durationMs) {
    const bar = btn?.querySelector(".tab-progress");
    if (!bar || reduceMotion || !durationMs) return;
    bar.classList.remove("is-running");
    bar.style.animationDuration = `${durationMs}ms`;
    void bar.offsetWidth;
    bar.classList.add("is-running");
  }

  function setPicker(index, durationMs) {
    clearTabProgress(picker);
    picker.forEach((b, i) => {
      const on = i === index;
      b.classList.toggle("is-active", on);
      if (on) runTabProgress(b, durationMs);
    });
  }

  function scheduleNextPrompt(gen) {
    if (!demoAuto || !demoVisible || gen !== demoGen) {
      demoRunning = false;
      return;
    }
    demoHoldTimer = window.setTimeout(() => {
      if (gen !== demoGen || !demoAuto || !demoVisible) {
        demoRunning = false;
        return;
      }
      promptIndex = (promptIndex + 1) % prompts.length;
      playPrompt(promptIndex);
    }, 2200);
  }

  function playPrompt(index) {
    if (!promptBox) return;
    clearDemoTimers();
    const gen = demoGen;
    demoRunning = true;
    promptIndex = index;
    const entry = prompts[index];
    const typeMs = reduceMotion ? 0 : Math.max(entry.text.length * 14, 400);
    const toolMs = reduceMotion ? 0 : entry.tools.length * 520;
    const holdMs = 2200;
    setPicker(index, typeMs + toolMs + holdMs);
    renderTools(entry.tools, -1);

    if (reduceMotion) {
      promptBox.textContent = entry.text;
      renderTools(entry.tools, entry.tools.length - 1);
      demoRunning = false;
      return;
    }

    let i = 0;
    const paintType = () => {
      if (gen !== demoGen) return;
      promptBox.innerHTML =
        escapeHtml(entry.text.slice(0, i)) +
        '<span class="cursor" aria-hidden="true"></span>';
    };
    paintType();

    const finishType = () => {
      if (gen !== demoGen) return;
      if (typeTimer) {
        window.clearInterval(typeTimer);
        typeTimer = null;
      }
      i = entry.text.length;
      paintType();
      let step = 0;
      const tickTools = () => {
        if (gen !== demoGen) return;
        renderTools(entry.tools, step);
        step += 1;
        if (step >= entry.tools.length) {
          if (toolTimer) {
            window.clearInterval(toolTimer);
            toolTimer = null;
          }
          scheduleNextPrompt(gen);
        }
      };
      tickTools();
      if (entry.tools.length > 1) {
        toolTimer = window.setInterval(tickTools, 520);
      }
    };

    typeTimer = window.setInterval(() => {
      if (gen !== demoGen) return;
      i += 1;
      paintType();
      if (i >= entry.text.length) finishType();
    }, 14);
  }

  function pauseDemoAuto(ms = 10000) {
    demoAuto = false;
    clearDemoTimers();
    clearTabProgress(picker);
    paintPromptStatic(promptIndex);
    window.setTimeout(() => {
      if (reduceMotion) return;
      demoAuto = true;
      if (demoVisible && !demoRunning) playPrompt(promptIndex);
    }, ms);
  }

  picker.forEach((btn) => {
    btn.addEventListener("click", () => {
      pauseDemoAuto();
      playPrompt(Number(btn.getAttribute("data-prompt") || 0));
      if (copyHint) copyHint.textContent = "";
    });
  });

  document.getElementById("copyPrompt")?.addEventListener("click", async () => {
    pauseDemoAuto(8000);
    const text = prompts[promptIndex].text;
    try {
      await navigator.clipboard.writeText(text);
      if (copyHint) copyHint.textContent = "Copied — paste into Cursor after Linked.";
    } catch {
      if (copyHint) copyHint.textContent = "Copy failed — select the prompt text manually.";
    }
  });

  if (reduceMotion) {
    demoVisible = true;
    playPrompt(0);
  } else if ("IntersectionObserver" in window && demoSection) {
    paintPromptStatic(0);
    const demoIo = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.12);
        if (visible === demoVisible) {
          if (visible && demoAuto && !demoRunning) playPrompt(promptIndex);
          return;
        }
        demoVisible = visible;
        if (demoVisible && demoAuto && !demoRunning) {
          playPrompt(promptIndex);
        } else if (!demoVisible) {
          clearDemoTimers();
          paintPromptStatic(promptIndex);
        }
      },
      { threshold: [0, 0.12, 0.25, 0.4], rootMargin: "0px 0px -8% 0px" },
    );
    demoIo.observe(demoSection);
    /* Kick once after layout — covers #demo hash land + first paint races */
    window.requestAnimationFrame(() => {
      const rect = demoSection.getBoundingClientRect();
      const view = window.innerHeight || 0;
      const visibleH = Math.min(rect.bottom, view) - Math.max(rect.top, 0);
      const ratio = rect.height > 0 ? visibleH / rect.height : 0;
      if (ratio >= 0.12 && demoAuto && !demoRunning) {
        demoVisible = true;
        playPrompt(promptIndex);
      }
    });
  } else {
    demoVisible = true;
    playPrompt(0);
  }

  /* Feature stack autoplay */
  const stackImg = document.getElementById("stackImg");
  const stackCaption = document.getElementById("stackCaption");
  const stackBtns = [...document.querySelectorAll("#stackSteps button")];
  let shotIndex = 0;
  let stackTimer = null;
  let stackAuto = !reduceMotion;
  let stackVisible = true;
  let stackBusy = false;

  function clearStackTimer() {
    if (stackTimer) window.clearTimeout(stackTimer);
    stackTimer = null;
  }

  const STACK_DWELL = 4200;

  function showShot(index, { animate = true } = {}) {
    const shot = shots[index] || shots[0];
    if (!stackImg || !stackCaption) return;
    shotIndex = index;
    clearTabProgress(stackBtns);
    stackBtns.forEach((b, i) => {
      const on = i === index;
      b.classList.toggle("is-active", on);
      if (on && stackAuto && !reduceMotion) runTabProgress(b, STACK_DWELL);
    });

    const apply = () => {
      stackImg.onerror = () => {
        if (shot.fallback) stackImg.src = shot.fallback;
      };
      stackImg.src = shot.src;
      stackImg.alt = shot.alt;
      stackCaption.textContent = shot.caption;
      stackImg.classList.remove("is-swap");
      stackCaption.classList.remove("is-swap");
      stackBusy = false;
    };

    if (!animate || reduceMotion) {
      apply();
      return;
    }

    stackBusy = true;
    stackImg.classList.add("is-swap");
    stackCaption.classList.add("is-swap");
    window.setTimeout(() => {
      apply();
    }, 280);
  }

  function scheduleNextShot() {
    clearStackTimer();
    if (!stackAuto || !stackVisible || reduceMotion) return;
    stackTimer = window.setTimeout(() => {
      if (stackBusy) {
        scheduleNextShot();
        return;
      }
      showShot((shotIndex + 1) % shots.length);
      scheduleNextShot();
    }, STACK_DWELL);
  }

  function pauseStackAuto(ms = 10000) {
    stackAuto = false;
    clearStackTimer();
    clearTabProgress(stackBtns);
    window.setTimeout(() => {
      if (reduceMotion) return;
      stackAuto = true;
      if (stackVisible) {
        runTabProgress(stackBtns[shotIndex], STACK_DWELL);
        scheduleNextShot();
      }
    }, ms);
  }

  stackBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      pauseStackAuto();
      showShot(Number(btn.getAttribute("data-shot") || 0));
    });
  });

  if ("IntersectionObserver" in window && stackSection) {
    const stackIo = new IntersectionObserver(
      (entries) => {
        stackVisible = entries.some((e) => e.isIntersecting);
        if (stackVisible && stackAuto) scheduleNextShot();
        else clearStackTimer();
      },
      { threshold: 0.25 },
    );
    stackIo.observe(stackSection);
  } else if (stackAuto) {
    scheduleNextShot();
  }

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

  /* Soft scroll float for section art (How / Why) */
  const floatArts = [...document.querySelectorAll("[data-float-art]")];
  if (floatArts.length && !reduceMotion) {
    let floatRaf = 0;
    function paintFloat() {
      floatRaf = 0;
      floatArts.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const view = window.innerHeight || 1;
        const mid = rect.top + rect.height / 2;
        const t = (mid - view / 2) / view;
        const y = Math.max(-18, Math.min(18, -t * 28));
        const s = 1 + Math.max(-0.015, Math.min(0.015, -t * 0.02));
        el.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
      });
    }
    function onFloat() {
      if (!floatRaf) floatRaf = window.requestAnimationFrame(paintFloat);
    }
    window.addEventListener("scroll", onFloat, { passive: true });
    window.addEventListener("resize", onFloat, { passive: true });
    onFloat();
  }
})();
