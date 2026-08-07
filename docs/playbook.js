(() => {
  const toc = document.querySelector(".doc-toc");
  if (!toc) return;

  const links = [...toc.querySelectorAll('a[href^="#"]')];
  const sections = links
    .map((link) => {
      const id = link.getAttribute("href")?.slice(1);
      const el = id ? document.getElementById(id) : null;
      return el ? { id, el, link } : null;
    })
    .filter(Boolean);

  if (!sections.length) return;

  let activeId = "";

  function setActive(id) {
    if (!id || id === activeId) return;
    activeId = id;
    links.forEach((link) => {
      const on = link.getAttribute("href") === `#${id}`;
      if (on) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }

  function pickFromScroll() {
    const marker = (window.innerHeight || 0) * 0.28;
    let current = sections[0].id;
    for (const section of sections) {
      const top = section.el.getBoundingClientRect().top;
      if (top <= marker) current = section.id;
      else break;
    }
    setActive(current);
  }

  let raf = 0;
  function onScroll() {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      pickFromScroll();
    });
  }

  links.forEach((link) => {
    link.addEventListener("click", () => {
      const id = link.getAttribute("href")?.slice(1);
      if (id) setActive(id);
    });
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  pickFromScroll();

  if (location.hash) {
    const id = location.hash.slice(1);
    if (sections.some((s) => s.id === id)) setActive(id);
  }
})();
