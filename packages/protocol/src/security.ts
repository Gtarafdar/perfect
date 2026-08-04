import type { RiskLevel, ToolName } from "./types.js";

/** Default high-risk hostname patterns (Claude-inspired category blocks). */
export const DEFAULT_BLOCKLIST_PATTERNS: RegExp[] = [
  /(?:^|\.)chase\.com$/i,
  /(?:^|\.)bankofamerica\.com$/i,
  /(?:^|\.)wellsfargo\.com$/i,
  /(?:^|\.)paypal\.com$/i,
  /(?:^|\.)stripe\.com$/i,
  /(?:^|\.)coinbase\.com$/i,
  /(?:^|\.)binance\.com$/i,
  /(?:^|\.)schwab\.com$/i,
  /(?:^|\.)fidelity\.com$/i,
  /(?:^|\.)etrade\.com$/i,
  /(?:^|\.)robinhood\.com$/i,
  /(?:^|\.)vanguard\.com$/i,
  /(?:^|\.)ally\.com$/i,
  /(?:^|\.)capitalone\.com$/i,
];

const PROHIBITED_LABEL =
  /\b(buy now|place order|pay now|complete purchase|checkout|add to cart|make payment|wire transfer|send money|delete forever|empty trash|permanently delete|close account|transfer funds|execute trade|market order|limit order|create account|sign up|register now|bypass captcha|i'?m not a robot)\b/i;

const PROTECTED_LABEL =
  /\b(download|export|allow access|grant permission|authorize|connect app|sign in with|continue with google|continue with github)\b/i;

const SENSITIVE_INPUT_TYPES = new Set([
  "password",
  "tel",
  "email",
  "credit-card",
  "cc-number",
  "cc-csc",
  "cc-exp",
]);

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /disregard (your|the) (system|safety|security)/i,
  /you are now (in )?(developer|god|unrestricted) mode/i,
  /do not (tell|inform|notify) the user/i,
  /exfiltrate|send (all )?(cookies|credentials|passwords|api keys)/i,
  /perfect[,:]?\s*(ignore|disable|skip).*(safety|permission|security)/i,
  /hidden instruction|prompt injection/i,
];

const CC_PATTERN = /\b(?:\d[ -]*?){13,19}\b/;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function matchesHostPattern(host: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(host));
}

export function isBlockedHost(
  host: string,
  blocklist: RegExp[] = DEFAULT_BLOCKLIST_PATTERNS,
  customHosts: string[] = [],
): boolean {
  if (!host) return false;
  if (customHosts.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  return matchesHostPattern(host, blocklist);
}

export function isAllowlistedHost(host: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  return allowlist.some((h) => host === h || host.endsWith(`.${h}`));
}

export interface ActionContext {
  tool: ToolName;
  url: string;
  label?: string;
  inputType?: string;
  inputName?: string;
  text?: string;
  evaluateCode?: string;
  pageTextSample?: string;
}

export interface Classification {
  risk: RiskLevel;
  reasons: string[];
}

export function classifyAction(ctx: ActionContext): Classification {
  const reasons: string[] = [];
  const blob = [ctx.label, ctx.inputName, ctx.text, ctx.evaluateCode]
    .filter(Boolean)
    .join(" ");

  if (ctx.tool === "browser_evaluate") {
    reasons.push("evaluate is guarded");
    if (
      /document\.cookie|localStorage|sessionStorage|indexedDB/i.test(
        ctx.evaluateCode ?? "",
      )
    ) {
      return { risk: "prohibited", reasons: [...reasons, "cookie/storage access blocked"] };
    }
  }

  if (PROHIBITED_LABEL.test(blob)) {
    reasons.push("prohibited action label");
    return { risk: "prohibited", reasons };
  }

  if (
    ctx.inputType &&
    (SENSITIVE_INPUT_TYPES.has(ctx.inputType) ||
      /password|card|cvv|ssn|social/i.test(ctx.inputType))
  ) {
    reasons.push("sensitive input field");
    return { risk: "protected", reasons };
  }

  if (ctx.text && (CC_PATTERN.test(ctx.text) || SSN_PATTERN.test(ctx.text))) {
    reasons.push("sensitive data pattern in text");
    return { risk: "prohibited", reasons };
  }

  if (ctx.tool === "browser_navigate" && /checkout|payment|billing/i.test(ctx.url)) {
    reasons.push("payment/checkout URL");
    return { risk: "protected", reasons };
  }

  if (
    ctx.tool === "browser_screenshot" ||
    ctx.tool === "browser_console" ||
    ctx.tool === "browser_network" ||
    ctx.tool === "browser_upload"
  ) {
    reasons.push(
      ctx.tool === "browser_screenshot"
        ? "screenshot may include sensitive on-screen data"
        : ctx.tool === "browser_console"
          ? "console may include sensitive logged data"
          : ctx.tool === "browser_network"
            ? "network log may include sensitive URLs/headers"
            : "file upload can send local files to the page",
    );
    return { risk: "protected", reasons };
  }

  if (
    ctx.tool === "browser_handle_dialog" &&
    ctx.text &&
    (CC_PATTERN.test(ctx.text) || SSN_PATTERN.test(ctx.text) || /password|secret|token/i.test(ctx.text))
  ) {
    reasons.push("sensitive dialog prompt text");
    return { risk: "protected", reasons };
  }

  if (PROTECTED_LABEL.test(blob)) {
    reasons.push("protected action label");
  }

  if (
    ctx.tool === "browser_fill" ||
    ctx.tool === "browser_type" ||
    ctx.tool === "browser_click" ||
    ctx.tool === "browser_hover" ||
    ctx.tool === "browser_select" ||
    ctx.tool === "browser_drag"
  ) {
    if (PROTECTED_LABEL.test(blob)) {
      return { risk: "protected", reasons };
    }
  }

  if (reasons.some((r) => r.includes("protected"))) {
    return { risk: "protected", reasons };
  }

  return { risk: "low", reasons };
}

export function scanForInjection(pageTextSample: string): string[] {
  if (!pageTextSample) return [];
  const flags: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(pageTextSample)) {
      flags.push(pattern.source);
    }
  }
  return flags;
}

export function requiresSitePermission(tool: ToolName): boolean {
  return (
    tool !== "browser_status" &&
    tool !== "browser_stop" &&
    tool !== "browser_tabs"
  );
}
