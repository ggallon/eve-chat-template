import type { EveDynamicToolPart } from "eve/react";
import {
  asRecord,
  formatPayload,
  readString,
  shortenPath,
  truncateInline,
} from "./format";

export type ToolStatus = "completed" | "denied" | "error" | "running";

export function needsInputResponse(part: EveDynamicToolPart) {
  return Boolean(
    part.toolMetadata?.eve?.inputRequest && !part.toolMetadata.eve.inputResponse
  );
}

export function hasToolDetails(part: EveDynamicToolPart) {
  if (isConnectionSearchTool(part)) {
    return false;
  }

  const hasInput =
    part.input !== undefined && formatPayload(part.input).trim().length > 0;
  const hasOutput =
    part.state === "output-available" &&
    formatPayload(part.output).trim().length > 0;
  const hasError =
    part.state === "output-error" && part.errorText.trim().length > 0;

  return (
    hasInput ||
    hasOutput ||
    hasError ||
    Boolean(part.toolMetadata?.eve?.inputRequest)
  );
}

function isConnectionSearchTool(part: EveDynamicToolPart) {
  const normalized = normalizeToolName(resolveToolName(part));

  return normalized.includes("connection") && normalized.includes("search");
}

export function getToolStatus(part: EveDynamicToolPart): ToolStatus {
  switch (part.state) {
    case "input-streaming":
    case "input-available":
    case "approval-requested":
    case "approval-responded":
      return "running";
    case "output-available":
      return "completed";
    case "output-denied":
      return "denied";
    case "output-error":
      return "error";
  }
}

export function getSettledToolStatus(
  status: ToolStatus,
  isSettled: boolean
): ToolStatus {
  return isSettled && status === "running" ? "completed" : status;
}

export function getToolGroupStatus(
  parts: readonly EveDynamicToolPart[]
): ToolStatus {
  const statuses = parts.map(getToolStatus);

  if (statuses.includes("error")) {
    return "error";
  }

  if (statuses.includes("denied")) {
    return "denied";
  }

  if (statuses.includes("running")) {
    return "running";
  }

  return "completed";
}

export function toolStatusLabel(status: ToolStatus) {
  switch (status) {
    case "completed":
      return "Complete";
    case "denied":
      return "Denied";
    case "error":
      return "Error";
    case "running":
      return "Running";
  }
}

export function summarizeToolGroup(
  parts: readonly EveDynamicToolPart[],
  status: ToolStatus
) {
  if (parts.length === 1) {
    return describeToolAction(parts[0]!, status);
  }

  const counts = new Map<string, number>();

  for (const part of parts) {
    const category = toolCategory(resolveToolName(part));
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const labels: string[] = [];
  const order: [string, string, string, string][] = [
    ["searched", "Searched", "thing", "things"],
    ["read", "Read", "item", "items"],
    ["wrote", "Wrote", "item", "items"],
    ["ran", "Ran", "action", "actions"],
  ];

  for (const [key, verb, singular, plural] of order) {
    const count = counts.get(key);

    if (count) {
      labels.push(`${verb} ${count} ${count === 1 ? singular : plural}`);
    }
  }

  return labels.join(", ") || `Used ${parts.length} tools`;
}

function toolCategory(name: string) {
  const normalized = normalizeToolName(name);

  if (normalized.includes("search") || normalized.includes("grep")) {
    return "searched";
  }

  if (normalized.includes("read") || normalized.includes("fetch")) {
    return "read";
  }

  if (normalized.includes("write") || normalized.includes("edit")) {
    return "wrote";
  }

  return "ran";
}

export function describeToolAction(
  part: EveDynamicToolPart,
  status = getToolStatus(part)
) {
  const name = resolveToolName(part);
  const normalized = normalizeToolName(name);
  const input = asRecord(part.input);
  const query = readString(input, [
    "query",
    "q",
    "search",
    "pattern",
    "prompt",
    "text",
  ]);
  const path = readString(input, ["path", "filePath", "filename"]);
  const command = readString(input, ["command", "cmd"]);
  const url = readString(input, ["url", "href"]);
  const connection = readString(input, [
    "connection",
    "connectionName",
    "connector",
    "source",
  ]);

  if (normalized.includes("connection") && normalized.includes("search")) {
    const verb = status === "running" ? "Searching" : "Searched";
    const connectionName = resolveConnectionName(name, connection);

    if (connectionName) {
      return `${verb} ${formatDisplayName(connectionName)}`;
    }

    if (query && query !== "*") {
      return `${verb} ${truncateInline(query, 72)}`;
    }

    return `${verb} connections`;
  }

  if (normalized.includes("search") || normalized.includes("grep")) {
    return query
      ? `Searched ${truncateInline(query, 72)}`
      : `Searched ${formatToolName(name)}`;
  }

  if (normalized.includes("read")) {
    return path ? `Read ${shortenPath(path)}` : `Read ${formatToolName(name)}`;
  }

  if (normalized.includes("write") || normalized.includes("edit")) {
    return path
      ? `Changed ${shortenPath(path)}`
      : `Changed ${formatToolName(name)}`;
  }

  if (normalized.includes("fetch")) {
    return url
      ? `Fetched ${truncateInline(url, 72)}`
      : `Fetched ${formatToolName(name)}`;
  }

  if (command) {
    return truncateInline(command, 72);
  }

  if (path) {
    return shortenPath(path);
  }

  if (query) {
    return truncateInline(query, 72);
  }

  return `Used ${formatToolName(name)}`;
}

export function resolveToolName(part: EveDynamicToolPart) {
  const metadataName = part.toolMetadata?.eve?.name;
  return metadataName && metadataName !== "unknown"
    ? metadataName
    : part.toolName;
}

export function formatToolName(name: string) {
  return normalizeToolName(name)
    .replace(/^connection search$/, "connection search")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToolName(name: string) {
  return name.replace(/__/g, " ").replace(/[_-]/g, " ").trim().toLowerCase();
}

function formatDisplayName(value: string) {
  const cleaned = value
    .replace(/^mcp\./, "")
    .replace(/\.com(?:\/.*)?$/, "")
    .replace(/[_-]/g, " ");

  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveConnectionName(
  toolName: string,
  inputConnection?: string | null
) {
  if (inputConnection && inputConnection !== "*") {
    return inputConnection;
  }

  const tokens = normalizeToolName(toolName).split(/\s+/).filter(Boolean);

  if (tokens[0] !== "connection" || tokens.length <= 2) {
    return null;
  }

  const connectionTokens = tokens
    .slice(1)
    .filter(
      (token) => token !== "search" && token !== "tool" && token !== "tools"
    );

  if (connectionTokens.length === 0) {
    return null;
  }

  return [...new Set(connectionTokens)].join(" ");
}
