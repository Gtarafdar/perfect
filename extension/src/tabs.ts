import { TAB_GROUP_COLOR, TAB_GROUP_TITLE } from "./constants.js";

let groupId: number | null = null;
const claimed = new Set<number>();

export function getClaimed(): number[] {
  return [...claimed];
}

export function isClaimed(tabId: number): boolean {
  return claimed.has(tabId);
}

export async function ensureGroup(): Promise<number> {
  if (groupId != null) {
    try {
      await chrome.tabGroups.get(groupId);
      return groupId;
    } catch {
      groupId = null;
    }
  }
  const tab = await chrome.tabs.create({ url: "about:blank", active: false });
  if (tab.id == null) throw new Error("Failed to create tab");
  groupId = await chrome.tabs.group({ tabIds: [tab.id] });
  await chrome.tabGroups.update(groupId, {
    title: TAB_GROUP_TITLE,
    color: TAB_GROUP_COLOR,
    collapsed: false,
  });
  claimed.add(tab.id);
  return groupId;
}

export async function claimTab(tabId: number): Promise<void> {
  const gid = await ensureGroup();
  try {
    await chrome.tabs.group({ tabIds: [tabId], groupId: gid });
  } catch {
    /* may already be grouped */
  }
  claimed.add(tabId);
}

/**
 * Prefer reusing a seed about:blank tab (from ensureGroup) instead of
 * always opening a second tab — stops the "opened thrice" thrash.
 */
export async function createClaimedTab(url: string, active = true): Promise<chrome.tabs.Tab> {
  const gid = await ensureGroup();

  const reusable = await findReusableBlankTab();
  if (reusable?.id != null) {
    const updated = await chrome.tabs.update(reusable.id, { url, active });
    claimed.add(reusable.id);
    return updated ?? reusable;
  }

  const tab = await chrome.tabs.create({ url, active });
  if (tab.id == null) throw new Error("no tab id");
  await chrome.tabs.group({ tabIds: [tab.id], groupId: gid });
  claimed.add(tab.id);
  return tab;
}

async function findReusableBlankTab(): Promise<chrome.tabs.Tab | null> {
  const all = await chrome.tabs.query({});
  for (const t of all) {
    if (t.id == null || !claimed.has(t.id)) continue;
    const u = t.url ?? "";
    if (u === "about:blank" || u === "chrome://newtab/" || u === "") return t;
  }
  return null;
}

/**
 * Resolve which tab to act on.
 * - Explicit tabId wins
 * - Else active claimed tab
 * - Else any claimed tab
 * - Else create one
 */
export async function resolveTabId(tabId?: number): Promise<number> {
  if (tabId != null) {
    if (!claimed.has(tabId)) await claimTab(tabId);
    return tabId;
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const active = tabs[0];
  if (active?.id != null && claimed.has(active.id)) return active.id;
  const claimedTabs = await chrome.tabs.query({});
  const first = claimedTabs.find((t) => t.id != null && claimed.has(t.id));
  if (first?.id != null) return first.id;
  const created = await createClaimedTab("about:blank", true);
  return created.id!;
}

/**
 * Navigate without spawning extra tabs: reuse claimed tab unless newTab=true.
 * Same-URL → activate only (no reload flash).
 */
export async function navigateClaimed(
  url: string,
  opts: { tabId?: number; newTab?: boolean } = {},
): Promise<number> {
  if (opts.newTab) {
    const t = await createClaimedTab(url, true);
    return t.id!;
  }

  const targetId =
    opts.tabId != null
      ? await resolveTabId(opts.tabId)
      : getClaimed().length > 0
        ? await resolveTabId(getClaimed()[0])
        : null;

  if (targetId != null) {
    const tab = await chrome.tabs.get(targetId);
    if (samePageUrl(tab.url ?? "", url)) {
      // Already there — just focus, don't reload (avoids white flash)
      await chrome.tabs.update(targetId, { active: true });
      return targetId;
    }
    await chrome.tabs.update(targetId, { url, active: true });
    return targetId;
  }

  const t = await createClaimedTab(url, true);
  return t.id!;
}

/** Compare URLs ignoring trailing slash / hash noise for "already open" checks. */
function samePageUrl(current: string, next: string): boolean {
  try {
    const a = new URL(current);
    const b = new URL(next);
    const norm = (u: URL) =>
      `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, "")}${u.search}`;
    return norm(a) === norm(b);
  } catch {
    return current === next;
  }
}

export async function listTabs(all: boolean) {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((t) => t.id != null && (all || claimed.has(t.id)))
    .map((t) => ({
      id: t.id!,
      url: t.url ?? "",
      title: t.title ?? "",
      active: !!t.active,
      groupId: t.groupId,
      claimed: claimed.has(t.id!),
    }));
}

export function releaseTab(tabId: number): void {
  claimed.delete(tabId);
}

chrome.tabs.onRemoved.addListener((tabId) => {
  claimed.delete(tabId);
});
