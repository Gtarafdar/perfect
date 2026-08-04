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

export async function createClaimedTab(url: string, active = true): Promise<chrome.tabs.Tab> {
  const gid = await ensureGroup();
  const tab = await chrome.tabs.create({ url, active });
  if (tab.id == null) throw new Error("no tab id");
  await chrome.tabs.group({ tabIds: [tab.id], groupId: gid });
  claimed.add(tab.id);
  return tab;
}

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
