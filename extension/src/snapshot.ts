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

let refMap = new Map<string, { backendNodeId?: number; x: number; y: number; name: string; role: string }>();

export function getRef(ref: string) {
  return refMap.get(ref);
}

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
      const interesting = 'a,button,input,textarea,select,summary,[role="button"],[role="link"],[contenteditable="true"]';
      const els = [...document.querySelectorAll(interesting)].slice(0, 200);
      const labelText = (el) => {
        const aria = (el.getAttribute('aria-label') || '').trim();
        if (aria) return aria;
        const id = el.getAttribute('id');
        if (id) {
          const lab = document.querySelector('label[for="' + CSS.escape(id) + '"]');
          if (lab?.innerText) return lab.innerText.trim();
        }
        const wrapped = el.closest('label');
        if (wrapped?.innerText) {
          const t = wrapped.innerText.replace(el.value || '', '').trim();
          if (t) return t;
        }
        // preceding sibling label / dt
        let prev = el.previousElementSibling;
        for (let i = 0; i < 3 && prev; i++, prev = prev.previousElementSibling) {
          if (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'DIV' || prev.tagName === 'P') {
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
      const nodes = els.map((el) => {
        const r = el.getBoundingClientRect();
        const role = el.getAttribute('role') || el.tagName.toLowerCase();
        const name = labelText(el).slice(0, 120);
        return {
          role,
          name,
          value: el.value || undefined,
          clickable: true,
          editable: /^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable,
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
          tag: el.tagName.toLowerCase(),
        };
      }).filter(n => n.x > 0 || n.y > 0);
      const textSample = document.body?.innerText?.slice(0, 8000) || '';
      return { nodes, textSample };
    })()`,
  );

  refMap = new Map();
  const nodes: SnapshotNode[] = raw.nodes.map((n, i) => {
    const ref = `e${i + 1}`;
    refMap.set(ref, { x: n.x, y: n.y, name: n.name, role: n.role });
    return {
      ref,
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

export async function highlightRef(tabId: number, ref: string): Promise<void> {
  const info = refMap.get(ref);
  if (!info) return;
  await cdp.evaluate(
    tabId,
    `(() => {
      const id = 'perfect-click-ring';
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #B8FF3C;border-radius:8px;box-shadow:0 0 0 4px rgba(184,255,60,0.25);transition:all .15s ease;';
        document.documentElement.appendChild(el);
      }
      el.style.left = '${info.x - 24}px';
      el.style.top = '${info.y - 24}px';
      el.style.width = '48px';
      el.style.height = '48px';
      setTimeout(() => el.remove(), 800);
    })()`,
  );
}
