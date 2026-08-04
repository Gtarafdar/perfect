/** Extension-local security (mirrors @perfect/protocol; bundled separately). */

import { assertTokenHex, mintTokenHex } from "./connect-snippet.js";

export type PermissionMode = "manual" | "auto" | "skip";
export type RiskLevel = "low" | "protected" | "prohibited";
export type PermissionDecision =
  | "allow_once"
  | "always_allow_site"
  | "deny"
  | "prohibited"
  | "pending";

export const DEFAULT_BLOCKLIST = [
  "chase.com",
  "bankofamerica.com",
  "wellsfargo.com",
  "paypal.com",
  "coinbase.com",
  "binance.com",
  "schwab.com",
  "fidelity.com",
  "robinhood.com",
  "vanguard.com",
];

const PROHIBITED =
  /\b(buy now|place order|pay now|complete purchase|checkout|make payment|wire transfer|send money|delete forever|empty trash|permanently delete|execute trade|market order|create account|sign up|bypass captcha|i'?m not a robot)\b/i;

const PROTECTED =
  /\b(download|export|allow access|grant permission|authorize|sign in with)\b/i;

const INJECTION = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /disregard (your|the) (system|safety|security)/i,
  /do not (tell|inform|notify) the user/i,
  /exfiltrate|send (all )?(cookies|credentials|passwords)/i,
  /perfect[,:]?\s*(ignore|disable|skip).*(safety|permission)/i,
];

export interface Settings {
  mode: PermissionMode;
  token: string;
  wsPort: number;
  allowlist: string[];
  allowlistOnly: boolean;
  blocklist: string[];
  alwaysAllowHosts: string[];
  skipConfirmed: boolean;
  approvedPlan: { sites: string[]; approach: string; ts: number } | null;
  audit: Array<{
    ts: number;
    tool: string;
    url: string;
    decision: string;
    summary: string;
  }>;
  actionLog: Array<{ ts: number; tool: string; summary: string }>;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "manual",
  token: "",
  wsPort: 17321,
  allowlist: [],
  allowlistOnly: false,
  blocklist: [...DEFAULT_BLOCKLIST],
  alwaysAllowHosts: [],
  skipConfirmed: false,
  approvedPlan: null,
  audit: [],
  actionLog: [],
};

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function hostMatch(host: string, list: string[]): boolean {
  return list.some((h) => host === h || host.endsWith(`.${h}`));
}

export function classify(opts: {
  tool: string;
  url: string;
  label?: string;
  inputType?: string;
  text?: string;
  code?: string;
}): { risk: RiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  const blob = [opts.label, opts.text, opts.code].filter(Boolean).join(" ");

  if (opts.tool === "browser_evaluate") {
    if (/document\.cookie|localStorage|sessionStorage/i.test(opts.code ?? "")) {
      return { risk: "prohibited", reasons: ["cookie/storage access blocked"] };
    }
  }
  if (
    opts.tool === "browser_screenshot" ||
    opts.tool === "browser_console" ||
    opts.tool === "browser_network" ||
    opts.tool === "browser_upload"
  ) {
    return {
      risk: "protected",
      reasons: [
        opts.tool === "browser_screenshot"
          ? "screenshot may include sensitive on-screen data"
          : opts.tool === "browser_console"
            ? "console may include sensitive logged data"
            : opts.tool === "browser_network"
              ? "network log may include sensitive URLs/headers"
              : "file upload can send local files to the page",
      ],
    };
  }
  if (
    opts.tool === "browser_handle_dialog" &&
    opts.text &&
    (/\b(?:\d[ -]*?){13,19}\b/.test(opts.text) || /password|secret|token/i.test(opts.text))
  ) {
    return { risk: "protected", reasons: ["sensitive dialog prompt text"] };
  }
  if (PROHIBITED.test(blob)) {
    return { risk: "prohibited", reasons: ["prohibited action label"] };
  }
  if (
    opts.inputType === "password" ||
    /password|card|cvv|ssn/i.test(opts.inputType ?? "")
  ) {
    return { risk: "protected", reasons: ["sensitive input"] };
  }
  if (/\b(?:\d[ -]*?){13,19}\b/.test(opts.text ?? "")) {
    return { risk: "prohibited", reasons: ["card-like data"] };
  }
  if (PROTECTED.test(blob)) {
    return { risk: "protected", reasons: ["protected action"] };
  }
  if (/checkout|payment|billing/i.test(opts.url)) {
    return { risk: "protected", reasons: ["payment URL"] };
  }
  return { risk: "low", reasons };
}

export function scanInjection(text: string): string[] {
  return INJECTION.filter((p) => p.test(text)).map((p) => p.source);
}

export function siteAllowed(host: string, s: Settings): { ok: boolean; reason?: string } {
  if (!host) return { ok: false, reason: "invalid host" };
  if (hostMatch(host, s.blocklist)) return { ok: false, reason: "blocklisted" };
  if (s.allowlistOnly && !hostMatch(host, s.allowlist)) {
    return { ok: false, reason: "not on allowlist" };
  }
  return { ok: true };
}

export async function loadSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(data.settings as Partial<Settings> | undefined) };
}

export async function saveSettings(partial: Partial<Settings>): Promise<Settings> {
  const cur = await loadSettings();
  const next = { ...cur, ...partial };
  await chrome.storage.local.set({ settings: next });
  return next;
}

/** Ensure a CSPRNG bridge token exists (extension-first pairing). Never logs the token. */
export async function ensureToken(): Promise<Settings> {
  const cur = await loadSettings();
  if (assertTokenHex(cur.token)) return cur;
  const token = mintTokenHex();
  return saveSettings({ token, wsPort: cur.wsPort || 17321 });
}

/** Rotate token after user confirm — old MCP env stops working until re-copy. */
export async function regenerateToken(): Promise<Settings> {
  const token = mintTokenHex();
  return saveSettings({ token });
}
