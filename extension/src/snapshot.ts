import * as cdp from "./cdp.js";
import { scanInjection } from "./security.js";

export interface SnapshotNode {
  ref: string;
  role: string;
  name: string;
  value?: string;
  clickable?: boolean;
  editable?: boolean;
  frame?: string;
  dialog?: boolean;
  children?: SnapshotNode[];
}

export interface RefInfo {
  x: number;
  y: number;
  name: string;
  role: string;
  editable?: boolean;
  frame?: string;
}

export type SnapshotMode = "compact" | "full" | "text";

let refMap = new Map<string, RefInfo>();

export function getRef(ref: string) {
  return refMap.get(ref);
}

export function clearRefs(): void {
  refMap = new Map();
}

/** Collect interactive nodes from top document + same-origin iframes. */
export async function snapshot(
  tabId: number,
  opts: { mode?: SnapshotMode } = {},
): Promise<{
  url: string;
  title: string;
  tabId: number;
  nodes: SnapshotNode[];
  injectionFlags: string[];
  text?: string;
  frames?: Array<{ id: string; src: string; sameOrigin: boolean }>;
  mode: SnapshotMode;
}> {
  const mode: SnapshotMode = opts.mode ?? "compact";
  const tab = await chrome.tabs.get(tabId);
  const raw = await cdp.evaluate<{
    nodes: Array<{
      ref: string;
      role: string;
      name: string;
      value?: string;
      clickable: boolean;
      editable: boolean;
      x: number;
      y: number;
      tag: string;
      frame?: string;
      dialog?: boolean;
    }>;
    textSample: string;
    textFull: string;
    frames: Array<{ id: string; src: string; sameOrigin: boolean }>;
  }>(tabId, SNAPSHOT_SCRIPT);

  refMap = new Map();

  const useful =
    mode === "full"
      ? raw.nodes.filter((n) => n.name?.length || n.editable || n.dialog)
      : raw.nodes.filter((n) => {
          if (n.editable || n.dialog) return true;
          if (!n.name || n.name.length < 2) return false;
          if (
            /^(PERSONAL|BUSINESS|PLANS|SECURITY|DOWNLOAD|Support|Log In|Buy Now|Premium|Family|Pricing|Blog|Reviews|English|Privacy|Stop|·)$/i.test(
              n.name,
            )
          ) {
            return false;
          }
          if (
            /RoboForm|vs\.|Get RoboForm|Help Center|Contact|Ticket|Manual|Tutorials|Bug Bounty|About|Press|Partner|Affiliate|Facebook|YouTube|Twitter|LinkedIn|Windows|Mac|iOS|Android|Browsers|Password Generator|Passphrase|Have I Been/i.test(
              n.name,
            )
          ) {
            return false;
          }
          return n.clickable;
        });

  const nodes: SnapshotNode[] = useful.map((n) => {
    refMap.set(n.ref, {
      x: n.x,
      y: n.y,
      name: n.name,
      role: n.role,
      editable: n.editable,
      frame: n.frame,
    });
    return {
      ref: n.ref,
      role: n.role,
      name: n.name,
      value: n.value,
      clickable: n.clickable,
      editable: n.editable,
      frame: n.frame,
      dialog: n.dialog,
    };
  });

  for (const n of raw.nodes) {
    if (!refMap.has(n.ref)) {
      refMap.set(n.ref, {
        x: n.x,
        y: n.y,
        name: n.name,
        role: n.role,
        editable: n.editable,
        frame: n.frame,
      });
    }
  }

  return {
    url: tab.url ?? "",
    title: tab.title ?? "",
    tabId,
    nodes,
    injectionFlags: scanInjection(raw.textSample),
    text: mode === "text" ? raw.textFull : undefined,
    frames: raw.frames,
    mode,
  };
}

const SNAPSHOT_SCRIPT = `(() => {
  document.querySelectorAll('[data-perfect-ref]').forEach((el) => {
    el.removeAttribute('data-perfect-ref');
  });

  const frames = [];
  const allNodes = [];
  let counter = 0;

  const compactSel =
    'a,button,input,textarea,select,summary,[role="button"],[role="link"],[role="menuitem"],[role="tab"],[role="checkbox"],[role="switch"],[role="option"],[contenteditable="true"],[role="dialog"],dialog,[aria-modal="true"],[draggable="true"]';
  const fullSel =
    compactSel + ',h1,h2,h3,h4,h5,h6,nav,main,aside,header,footer,[role="heading"],[role="navigation"],[role="main"],label,li,#drop-zone,[data-drop-zone]';

  const labelText = (el, doc) => {
    const aria = (el.getAttribute('aria-label') || '').trim();
    if (aria) return aria;
    const id = el.getAttribute('id');
    if (id) {
      try {
        const lab = doc.querySelector('label[for="' + CSS.escape(id) + '"]');
        if (lab?.innerText) return lab.innerText.trim().split('\\n')[0].trim();
      } catch (_) {}
    }
    const wrapped = el.closest('label');
    if (wrapped) {
      const clone = wrapped.cloneNode(true);
      clone.querySelectorAll('input,textarea,select').forEach((n) => n.remove());
      const t = (clone.innerText || '').trim();
      if (t) return t.split('\\n')[0].trim();
    }
    const td = el.closest('td');
    const prevTd = td?.previousElementSibling;
    if (prevTd && prevTd.tagName === 'TD') {
      const t = (prevTd.innerText || '').trim();
      if (t && t.length < 80) return t;
    }
    let prev = el.previousElementSibling;
    for (let i = 0; i < 3 && prev; i++, prev = prev.previousElementSibling) {
      if (/^(LABEL|SPAN|DIV|P|B|STRONG)$/i.test(prev.tagName)) {
        const t = (prev.innerText || '').trim();
        if (t && t.length < 80) return t;
      }
    }
    const ph = (el.getAttribute('placeholder') || '').trim();
    if (ph) return ph;
    const name = (el.getAttribute('name') || '').trim();
    if (name) return name;
    return (el.innerText || el.textContent || '').trim();
  };

  const collect = (doc, win, frameId, offsetX, offsetY, selector) => {
    const els = [...doc.querySelectorAll(selector)]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const st = win.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') return false;
        if (r.width < 2 || r.height < 2) return false;
        return true;
      })
      .slice(0, frameId ? 120 : 200);

    for (const el of els) {
      counter += 1;
      const ref = 'e' + counter;
      el.setAttribute('data-perfect-ref', ref);
      const r = el.getBoundingClientRect();
      const role = el.getAttribute('role') || el.tagName.toLowerCase();
      const dialog =
        role === 'dialog' ||
        el.tagName === 'DIALOG' ||
        el.getAttribute('aria-modal') === 'true';
      allNodes.push({
        ref,
        role,
        name: labelText(el, doc).slice(0, 120),
        value: 'value' in el ? el.value : undefined,
        clickable: true,
        editable:
          /^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable,
        x: Math.round(offsetX + r.left + r.width / 2),
        y: Math.round(offsetY + r.top + r.height / 2),
        tag: el.tagName.toLowerCase(),
        frame: frameId || undefined,
        dialog: dialog || undefined,
      });
    }
  };

  collect(document, window, '', 0, 0, fullSel);

  [...document.querySelectorAll('iframe')].forEach((iframe, i) => {
    const id = 'f' + (i + 1);
    const src = iframe.getAttribute('src') || '';
    let sameOrigin = false;
    try {
      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (doc && win) {
        sameOrigin = true;
        const ir = iframe.getBoundingClientRect();
        collect(doc, win, id, ir.left, ir.top, fullSel);
      }
    } catch (_) {
      sameOrigin = false;
    }
    frames.push({ id, src, sameOrigin });
  });

  const textSample = document.body?.innerText?.slice(0, 8000) || '';
  let textFull = textSample;
  try {
    const parts = [document.body?.innerText || ''];
    for (const iframe of document.querySelectorAll('iframe')) {
      try {
        const t = iframe.contentDocument?.body?.innerText;
        if (t) parts.push(t);
      } catch (_) {}
    }
    textFull = parts.join('\\n\\n').slice(0, 50000);
  } catch (_) {}

  return { nodes: allNodes, textSample, textFull, frames };
})()`;

/** Scroll element into view and return fresh viewport center (top-window coords). */
export async function resolveTarget(
  tabId: number,
  ref: string,
): Promise<{ x: number; y: number; w: number; h: number } | null> {
  const safe = cssRef(ref);
  const box = await cdp.evaluate<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(
    tabId,
    `(() => {
      const find = (ref) => {
        let el = document.querySelector('[data-perfect-ref="' + ref + '"]');
        if (el) return { el, ox: 0, oy: 0 };
        for (const iframe of document.querySelectorAll('iframe')) {
          try {
            const doc = iframe.contentDocument;
            if (!doc) continue;
            el = doc.querySelector('[data-perfect-ref="' + ref + '"]');
            if (el) {
              const ir = iframe.getBoundingClientRect();
              return { el, ox: ir.left, oy: ir.top };
            }
          } catch (_) {}
        }
        return null;
      };
      const hit = find(${JSON.stringify(safe)});
      if (!hit) return null;
      hit.el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      // Recompute after scroll (iframe offset may change)
      let ox = hit.ox, oy = hit.oy;
      for (const iframe of document.querySelectorAll('iframe')) {
        try {
          if (iframe.contentDocument?.contains(hit.el)) {
            const ir = iframe.getBoundingClientRect();
            ox = ir.left; oy = ir.top;
            break;
          }
        } catch (_) {}
      }
      const r = hit.el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      return {
        x: Math.round(ox + r.left + r.width / 2),
        y: Math.round(oy + r.top + r.height / 2),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    })()`,
  );
  if (!box) return null;
  const prev = refMap.get(ref);
  if (prev) refMap.set(ref, { ...prev, x: box.x, y: box.y });
  return box;
}

export async function highlightRef(tabId: number, ref: string): Promise<void> {
  const safe = cssRef(ref);
  await cdp.evaluate(
    tabId,
    `(() => {
      const find = (ref) => {
        let el = document.querySelector('[data-perfect-ref="' + ref + '"]');
        if (el) return { el, doc: document };
        for (const iframe of document.querySelectorAll('iframe')) {
          try {
            const doc = iframe.contentDocument;
            if (!doc) continue;
            el = doc.querySelector('[data-perfect-ref="' + ref + '"]');
            if (el) return { el, doc };
          } catch (_) {}
        }
        return null;
      };
      const hit = find(${JSON.stringify(safe)});
      if (!hit) return;
      const r = hit.el.getBoundingClientRect();
      const host = document.documentElement;
      const id = 'perfect-click-ring';
      let ring = document.getElementById(id);
      if (!ring) {
        ring = document.createElement('div');
        ring.id = id;
        ring.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #B8FF3C;border-radius:8px;box-shadow:0 0 0 4px rgba(184,255,60,0.25);transition:all .12s ease;';
        host.appendChild(ring);
      }
      let ox = 0, oy = 0;
      for (const iframe of document.querySelectorAll('iframe')) {
        try {
          if (iframe.contentDocument?.contains(hit.el)) {
            const ir = iframe.getBoundingClientRect();
            ox = ir.left; oy = ir.top;
            break;
          }
        } catch (_) {}
      }
      ring.style.left = Math.max(0, ox + r.left - 4) + 'px';
      ring.style.top = Math.max(0, oy + r.top - 4) + 'px';
      ring.style.width = Math.max(8, r.width + 8) + 'px';
      ring.style.height = Math.max(8, r.height + 8) + 'px';
      setTimeout(() => ring.remove(), 900);
    })()`,
  );
}

/** Move cursor overlay, DOM-click the live element, ensure focused. */
export async function focusRef(tabId: number, ref: string): Promise<boolean> {
  const box = await resolveTarget(tabId, ref);
  if (!box) return false;
  await highlightRef(tabId, ref);
  await cdp.delay(10);
  await cdp.moveCursorOverlay(tabId, box.x, box.y);
  await cdp.delay(15);

  const safe = cssRef(ref);
  let focused = await clickRefInPage(tabId, safe);

  if (!focused) {
    const retry = await resolveTarget(tabId, ref);
    if (retry) {
      await cdp.moveCursorOverlay(tabId, retry.x, retry.y);
      await cdp.delay(40);
      focused = await clickRefInPage(tabId, safe);
    }
  }
  return focused;
}

async function clickRefInPage(tabId: number, safeRef: string): Promise<boolean> {
  return cdp.evaluate<boolean>(
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
      const el = find(${JSON.stringify(safeRef)});
      if (!el) return false;
      try { el.click(); } catch (_) {}
      try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (_) {} }
      const active = el.ownerDocument.activeElement;
      return active === el || el.contains(active);
    })()`,
  );
}

/** Hover: cursor move + mouseenter/pointerover without click. */
export async function hoverRef(tabId: number, ref: string): Promise<boolean> {
  const box = await resolveTarget(tabId, ref);
  if (!box) return false;
  await highlightRef(tabId, ref);
  await cdp.moveCursorOverlay(tabId, box.x, box.y);
  await cdp.delay(20);
  const safe = cssRef(ref);
  return cdp.evaluate<boolean>(
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
      if (!el) return false;
      for (const type of ['pointerover','pointerenter','mouseover','mouseenter']) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
      return true;
    })()`,
  );
}

/** Drag from one ref to another with visible cursor + HTML5 drag events. */
export async function dragRef(
  tabId: number,
  fromRef: string,
  toRef: string,
): Promise<boolean> {
  const from = await resolveTarget(tabId, fromRef);
  const to = await resolveTarget(tabId, toRef);
  if (!from || !to) return false;
  await highlightRef(tabId, fromRef);
  await cdp.moveCursorOverlay(tabId, from.x, from.y);
  await cdp.delay(40);
  const ok = await cdp.evaluate<boolean>(
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
      const src = find(${JSON.stringify(cssRef(fromRef))});
      const dst = find(${JSON.stringify(cssRef(toRef))});
      if (!src || !dst) return false;
      const dt = new DataTransfer();
      src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      dst.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
      dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      const dropped = dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      src.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
      // Also fire mouse sequence for non-HTML5 handlers
      src.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: ${from.x}, clientY: ${from.y} }));
      dst.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: ${to.x}, clientY: ${to.y} }));
      dst.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: ${to.x}, clientY: ${to.y} }));
      return true;
    })()`,
  );
  await cdp.moveCursorOverlay(tabId, to.x, to.y);
  await highlightRef(tabId, toRef);
  return ok;
}

export async function readRefValue(tabId: number, ref: string): Promise<string | null> {
  const safe = cssRef(ref);
  return cdp.evaluate<string | null>(
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
      if (!el) return null;
      if ('value' in el) return String(el.value ?? '');
      return el.textContent || '';
    })()`,
  );
}

export async function nativeFillRef(
  tabId: number,
  ref: string,
  text: string,
): Promise<boolean> {
  const safe = cssRef(ref);
  const safeText = JSON.stringify(text);
  return cdp.evaluate<boolean>(
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
      if (!el) return false;
      el.focus();
      if (el.tagName === 'SELECT') {
        el.value = ${safeText};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return String(el.value ?? '') === ${safeText};
      }
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, ${safeText});
      else el.value = ${safeText};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return String(el.value ?? '') === ${safeText};
    })()`,
  );
}

export async function selectRef(
  tabId: number,
  ref: string,
  value: string,
): Promise<boolean> {
  await focusRef(tabId, ref);
  return nativeFillRef(tabId, ref, value);
}

/** Draw annotation overlays then return; caller takes screenshot. */
export async function annotateRefs(
  tabId: number,
  items: Array<{ ref: string; label?: string }>,
): Promise<string[]> {
  const captions: string[] = [];
  const payload = JSON.stringify(
    items.map((it, i) => ({
      ref: cssRef(it.ref),
      label: it.label || getRef(it.ref)?.name || it.ref,
      n: i + 1,
    })),
  );
  await cdp.evaluate(
    tabId,
    `(() => {
      document.getElementById('perfect-annotate-root')?.remove();
      const root = document.createElement('div');
      root.id = 'perfect-annotate-root';
      root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483645;';
      document.documentElement.appendChild(root);
      const items = ${payload};
      const find = (ref) => {
        let el = document.querySelector('[data-perfect-ref="' + ref + '"]');
        if (el) return { el, ox: 0, oy: 0 };
        for (const iframe of document.querySelectorAll('iframe')) {
          try {
            const doc = iframe.contentDocument;
            if (!doc) continue;
            el = doc.querySelector('[data-perfect-ref="' + ref + '"]');
            if (el) {
              const ir = iframe.getBoundingClientRect();
              return { el, ox: ir.left, oy: ir.top };
            }
          } catch (_) {}
        }
        return null;
      };
      for (const it of items) {
        const hit = find(it.ref);
        if (!hit) continue;
        const r = hit.el.getBoundingClientRect();
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;border:2px solid #B8FF3C;border-radius:6px;background:rgba(184,255,60,0.12);box-shadow:0 0 0 2px rgba(10,11,10,0.35);';
        box.style.left = (hit.ox + r.left - 3) + 'px';
        box.style.top = (hit.oy + r.top - 3) + 'px';
        box.style.width = (r.width + 6) + 'px';
        box.style.height = (r.height + 6) + 'px';
        const badge = document.createElement('div');
        badge.textContent = it.n + '. ' + String(it.label || '').slice(0, 40);
        badge.style.cssText = 'position:absolute;left:0;top:-22px;background:#0A0B0A;color:#B8FF3C;font:11px/1.2 ui-sans-serif,system-ui,sans-serif;padding:3px 6px;border-radius:4px;white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis;';
        box.appendChild(badge);
        root.appendChild(box);
      }
    })()`,
  );
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    captions.push(`${i + 1}. ${it.label || getRef(it.ref)?.name || it.ref}`);
  }
  return captions;
}

export async function clearAnnotations(tabId: number): Promise<void> {
  await cdp.evaluate(
    tabId,
    `(() => { document.getElementById('perfect-annotate-root')?.remove(); })()`,
  );
}

export async function extractFromPage(
  tabId: number,
  opts: {
    selector?: string;
    links?: boolean;
    tables?: boolean;
    attrs?: string[];
  },
): Promise<{
  items: Array<Record<string, string>>;
  links?: Array<{ href: string; text: string }>;
  tables?: string[][][];
  textSample: string;
}> {
  const selector = opts.selector || "h1,h2,h3,p,li,td,th,article";
  const attrs = opts.attrs || ["href", "src", "alt", "title"];
  return cdp.evaluate(
    tabId,
    `(() => {
      const sel = ${JSON.stringify(selector)};
      const attrNames = ${JSON.stringify(attrs)};
      const wantLinks = ${opts.links !== false};
      const wantTables = ${!!opts.tables};
      const items = [];
      const docs = [document];
      for (const iframe of document.querySelectorAll('iframe')) {
        try { if (iframe.contentDocument) docs.push(iframe.contentDocument); } catch (_) {}
      }
      for (const doc of docs) {
        for (const el of [...doc.querySelectorAll(sel)].slice(0, 200)) {
          const row = { tag: el.tagName.toLowerCase(), text: (el.innerText || el.textContent || '').trim().slice(0, 500) };
          for (const a of attrNames) {
            const v = el.getAttribute(a);
            if (v) row[a] = v;
          }
          if (row.text || row.href || row.src) items.push(row);
        }
      }
      let links = undefined;
      if (wantLinks) {
        links = [];
        for (const doc of docs) {
          for (const a of [...doc.querySelectorAll('a[href]')].slice(0, 200)) {
            links.push({ href: a.href, text: (a.innerText || '').trim().slice(0, 120) });
          }
        }
      }
      let tables = undefined;
      if (wantTables) {
        tables = [];
        for (const doc of docs) {
          for (const table of [...doc.querySelectorAll('table')].slice(0, 20)) {
            const rows = [...table.querySelectorAll('tr')].map((tr) =>
              [...tr.querySelectorAll('th,td')].map((c) => (c.innerText || '').trim())
            );
            tables.push(rows);
          }
        }
      }
      const textSample = (document.body?.innerText || '').slice(0, 4000);
      return { items, links, tables, textSample };
    })()`,
  );
}

export async function waitForCondition(
  tabId: number,
  opts: { selector?: string; urlIncludes?: string; timeoutMs?: number },
): Promise<{ ok: boolean; reason: string; waited: number }> {
  const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 10000, 100), 30000);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (opts.urlIncludes) {
      const tab = await chrome.tabs.get(tabId);
      if ((tab.url ?? "").includes(opts.urlIncludes)) {
        return { ok: true, reason: "url", waited: Date.now() - start };
      }
    }
    if (opts.selector) {
      const found = await cdp.evaluate<boolean>(
        tabId,
        `(() => {
          const sel = ${JSON.stringify(opts.selector)};
          if (document.querySelector(sel)) return true;
          for (const iframe of document.querySelectorAll('iframe')) {
            try {
              if (iframe.contentDocument?.querySelector(sel)) return true;
            } catch (_) {}
          }
          return false;
        })()`,
      );
      if (found) return { ok: true, reason: "selector", waited: Date.now() - start };
    }
    if (!opts.selector && !opts.urlIncludes) {
      await cdp.delay(Math.min(timeoutMs, 1000));
      return { ok: true, reason: "ms", waited: Date.now() - start };
    }
    await cdp.delay(150);
  }
  return { ok: false, reason: "timeout", waited: Date.now() - start };
}

function cssRef(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9_-]/g, "");
}
