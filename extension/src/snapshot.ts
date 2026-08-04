import * as cdp from "./cdp.js";
import { scanInjection } from "./security.js";

export interface SnapshotNode {
  ref: string;
  role: string;
  name: string;
  value?: string;
  clickable?: boolean;
  editable?: boolean;
  children?: SnapshotNode[];
}

export interface RefInfo {
  x: number;
  y: number;
  name: string;
  role: string;
  editable?: boolean;
}

let refMap = new Map<string, RefInfo>();

export function getRef(ref: string) {
  return refMap.get(ref);
}

/**
 * Snapshot interactive elements and stamp each with data-perfect-ref
 * so later click/fill can re-resolve LIVE viewport coordinates after scroll.
 */
export async function snapshot(tabId: number): Promise<{
  url: string;
  title: string;
  tabId: number;
  nodes: SnapshotNode[];
  injectionFlags: string[];
}> {
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
    }>;
    textSample: string;
  }>(
    tabId,
    `(() => {
      document.querySelectorAll('[data-perfect-ref]').forEach((el) => {
        el.removeAttribute('data-perfect-ref');
      });
      const interesting = 'a,button,input,textarea,select,summary,[role="button"],[role="link"],[contenteditable="true"]';
      const els = [...document.querySelectorAll(interesting)]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const st = window.getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden') return false;
          if (r.width < 2 || r.height < 2) return false;
          return true;
        })
        .slice(0, 200);

      const labelText = (el) => {
        const aria = (el.getAttribute('aria-label') || '').trim();
        if (aria) return aria;
        const id = el.getAttribute('id');
        if (id) {
          try {
            const lab = document.querySelector('label[for="' + CSS.escape(id) + '"]');
            if (lab?.innerText) return lab.innerText.trim().split('\\n')[0].trim();
          } catch (_) { /* ignore */ }
        }
        const wrapped = el.closest('label');
        if (wrapped) {
          const clone = wrapped.cloneNode(true);
          clone.querySelectorAll('input,textarea,select').forEach((n) => n.remove());
          const t = (clone.innerText || '').trim();
          if (t) return t.split('\\n')[0].trim();
        }
        // Common pattern: <td>Label</td><td><input>
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
        return (el.innerText || '').trim();
      };

      const nodes = els.map((el, i) => {
        const ref = 'e' + (i + 1);
        el.setAttribute('data-perfect-ref', ref);
        const r = el.getBoundingClientRect();
        const role = el.getAttribute('role') || el.tagName.toLowerCase();
        const name = labelText(el).slice(0, 120);
        return {
          ref,
          role,
          name,
          value: el.value || undefined,
          clickable: true,
          editable: /^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable,
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
          tag: el.tagName.toLowerCase(),
        };
      });
      const textSample = document.body?.innerText?.slice(0, 8000) || '';
      return { nodes, textSample };
    })()`,
  );

  refMap = new Map();
  const nodes: SnapshotNode[] = raw.nodes.map((n) => {
    refMap.set(n.ref, {
      x: n.x,
      y: n.y,
      name: n.name,
      role: n.role,
      editable: n.editable,
    });
    return {
      ref: n.ref,
      role: n.role,
      name: n.name,
      value: n.value,
      clickable: n.clickable,
      editable: n.editable,
    };
  });

  return {
    url: tab.url ?? "",
    title: tab.title ?? "",
    tabId,
    nodes,
    injectionFlags: scanInjection(raw.textSample),
  };
}

/** Scroll element into view and return fresh viewport center (never use stale snapshot x/y). */
export async function resolveTarget(
  tabId: number,
  ref: string,
): Promise<{ x: number; y: number; w: number; h: number } | null> {
  const sel = JSON.stringify(`[data-perfect-ref="${cssRef(ref)}"]`);
  const box = await cdp.evaluate<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(
    tabId,
    `(() => {
      const el = document.querySelector(${sel});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      return {
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
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
  const sel = JSON.stringify(`[data-perfect-ref="${cssRef(ref)}"]`);
  await cdp.evaluate(
    tabId,
    `(() => {
      const el = document.querySelector(${sel});
      if (!el) return;
      const r = el.getBoundingClientRect();
      const id = 'perfect-click-ring';
      let ring = document.getElementById(id);
      if (!ring) {
        ring = document.createElement('div');
        ring.id = id;
        ring.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #B8FF3C;border-radius:8px;box-shadow:0 0 0 4px rgba(184,255,60,0.25);transition:all .12s ease;';
        document.documentElement.appendChild(ring);
      }
      ring.style.left = Math.max(0, r.left - 4) + 'px';
      ring.style.top = Math.max(0, r.top - 4) + 'px';
      ring.style.width = Math.max(8, r.width + 8) + 'px';
      ring.style.height = Math.max(8, r.height + 8) + 'px';
      setTimeout(() => ring.remove(), 900);
    })()`,
  );
}

/** Move cursor, click the live element, ensure it is focused. */
export async function focusRef(tabId: number, ref: string): Promise<boolean> {
  const box = await resolveTarget(tabId, ref);
  if (!box) return false;
  await highlightRef(tabId, ref);
  await cdp.delay(80 + Math.random() * 60);
  await cdp.clickAt(tabId, box.x, box.y);
  await cdp.delay(100 + Math.random() * 80);

  const sel = JSON.stringify(`[data-perfect-ref="${cssRef(ref)}"]`);
  let focused = await cdp.evaluate<boolean>(
    tabId,
    `(() => {
      const el = document.querySelector(${sel});
      if (!el) return false;
      if (document.activeElement === el) return true;
      try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
      return document.activeElement === el || el.contains(document.activeElement);
    })()`,
  );

  if (!focused) {
    const retry = await resolveTarget(tabId, ref);
    if (retry) {
      await cdp.clickAt(tabId, retry.x, retry.y);
      await cdp.delay(80);
      focused = await cdp.evaluate<boolean>(
        tabId,
        `(() => {
          const el = document.querySelector(${sel});
          return !!el && (document.activeElement === el || el.contains(document.activeElement));
        })()`,
      );
    }
  }
  return focused;
}

/** Read current value of a stamped field (for fill verification). */
export async function readRefValue(tabId: number, ref: string): Promise<string | null> {
  const sel = JSON.stringify(`[data-perfect-ref="${cssRef(ref)}"]`);
  return cdp.evaluate<string | null>(
    tabId,
    `(() => {
      const el = document.querySelector(${sel});
      if (!el) return null;
      if ('value' in el) return String(el.value ?? '');
      return el.textContent || '';
    })()`,
  );
}

/**
 * If typing didn't stick (missed focus), set value the React-safe way
 * after we've already done the visible cursor/click choreography.
 */
export async function nativeFillRef(
  tabId: number,
  ref: string,
  text: string,
): Promise<boolean> {
  const sel = JSON.stringify(`[data-perfect-ref="${cssRef(ref)}"]`);
  const safeText = JSON.stringify(text);
  return cdp.evaluate<boolean>(
    tabId,
    `(() => {
      const el = document.querySelector(${sel});
      if (!el) return false;
      el.focus();
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

function cssRef(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9_-]/g, "");
}
