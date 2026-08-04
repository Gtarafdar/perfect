/** Perfect bridge protocol — Cursor MCP ↔ Chrome extension */

export const PROTOCOL_VERSION = 1 as const;

export const DEFAULT_WS_PORT = 17321;
export const DEFAULT_WS_HOST = "127.0.0.1";
export const NATIVE_HOST_NAME = "com.perfect.bridge";
export const TAB_GROUP_TITLE = "Perfect";
export const TAB_GROUP_COLOR = "green" as const;

export type PermissionMode = "manual" | "auto" | "skip";

export type ToolName =
  | "browser_tabs"
  | "browser_navigate"
  | "browser_back"
  | "browser_forward"
  | "browser_snapshot"
  | "browser_click"
  | "browser_type"
  | "browser_fill"
  | "browser_press"
  | "browser_scroll"
  | "browser_screenshot"
  | "browser_wait"
  | "browser_evaluate"
  | "browser_propose_plan"
  | "browser_stop"
  | "browser_status";

export type PermissionDecision =
  | "allow_once"
  | "always_allow_site"
  | "deny"
  | "prohibited"
  | "pending";

export type RiskLevel = "low" | "protected" | "prohibited";

export interface BridgeHello {
  type: "hello";
  protocolVersion: typeof PROTOCOL_VERSION;
  token: string;
  role: "mcp" | "extension";
}

export interface BridgeHelloAck {
  type: "hello_ack";
  ok: boolean;
  error?: string;
  extensionId?: string;
}

export interface ToolRequest {
  type: "tool_request";
  id: string;
  tool: ToolName;
  args: Record<string, unknown>;
}

export interface ToolResponse {
  type: "tool_response";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  decision?: PermissionDecision;
  risk?: RiskLevel;
}

export interface PermissionPrompt {
  type: "permission_prompt";
  id: string;
  tool: ToolName;
  url: string;
  host: string;
  summary: string;
  risk: RiskLevel;
}

export interface PermissionReply {
  type: "permission_reply";
  id: string;
  decision: Exclude<PermissionDecision, "prohibited" | "pending">;
}

export interface EventMessage {
  type: "event";
  event:
    | "connected"
    | "disconnected"
    | "tool_start"
    | "tool_end"
    | "stopped"
    | "mode_changed"
    | "audit";
  payload?: Record<string, unknown>;
}

export interface BridgePing {
  type: "ping";
  t: number;
}

export interface BridgePong {
  type: "pong";
  t: number;
}

export type BridgeMessage =
  | BridgeHello
  | BridgeHelloAck
  | ToolRequest
  | ToolResponse
  | PermissionPrompt
  | PermissionReply
  | EventMessage
  | BridgePing
  | BridgePong;

export interface TabInfo {
  id: number;
  url: string;
  title: string;
  active: boolean;
  groupId?: number;
  claimed: boolean;
}

export interface SnapshotNode {
  ref: string;
  role: string;
  name: string;
  value?: string;
  clickable?: boolean;
  editable?: boolean;
  focused?: boolean;
  children?: SnapshotNode[];
}

export interface SnapshotResult {
  url: string;
  title: string;
  tabId: number;
  nodes: SnapshotNode[];
  injectionFlags?: string[];
}

export interface ProposePlanArgs {
  sites: string[];
  approach: string;
  tools?: ToolName[];
}

export interface AuditEntry {
  ts: number;
  tool: ToolName;
  url: string;
  decision: PermissionDecision;
  summary: string;
}
