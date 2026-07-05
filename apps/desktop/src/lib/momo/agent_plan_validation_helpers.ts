import type {
  AgentIssuePriority,
  AgentIssueStatus,
  AgentProjectType,
  AgentProviderKind,
  AgentTaskStatus,
} from "./agent_plan_types";

interface ValidationContext {
  readonly sourceNote: string;
  readonly errors: string[];
  readonly seenCreatePaths: Set<string>;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  label: string,
  errors: string[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      errors.push(`${label} has unsupported fields`);
      return;
    }
  }
}

function readRequiredArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
  errors: string[],
): readonly unknown[] {
  const value = record[key];
  if (Array.isArray(value)) return value;
  errors.push(`${label} must be an array`);
  return [];
}

function readRequiredString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
  errors: string[],
): string | null {
  const value = record[key];
  if (typeof value === "string" && value.length > 0) return value;
  errors.push(`${label} must be a non-empty string`);
  return null;
}

function readRequiredPath(
  record: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
  errors: string[],
): string | null {
  return readSafePath(record[key], label, errors);
}

function readSafePath(value: unknown, label: string, errors: string[]): string | null {
  const path = typeof value === "string" && value.length > 0 ? value : null;
  if (path === null) {
    errors.push(`${label} must be a path string`);
    return null;
  }
  if (
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\0") ||
    !path.endsWith(".md") ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    errors.push(`${label} must be a safe vault-relative Markdown path`);
    return null;
  }
  return path;
}

function readPathArray(value: unknown, label: string, errors: string[]): readonly string[] {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return [];
  }
  return value.flatMap((entry, index) => {
    const path = readSafePath(entry, `${label}[${index}]`, errors);
    return path ? [path] : [];
  });
}

function readTitle(
  record: Readonly<Record<string, unknown>>,
  label: string,
  errors: string[],
): string | null {
  const title = readRequiredString(record, "title", `${label}.title`, errors);
  if (title !== null && title.length > 120)
    errors.push(`${label}.title must be at most 120 characters`);
  return title;
}

function stringField(value: unknown, key: string): Record<string, string> {
  return typeof value === "string" && value.length > 0 ? { [key]: value } : {};
}

function parseProviderKind(value: unknown): AgentProviderKind | null {
  switch (value) {
    case "codex_cli":
    case "openai_api":
      return value;
    default:
      return null;
  }
}

function parseTaskStatus(value: unknown): AgentTaskStatus | null {
  switch (value) {
    case "done":
    case "todo":
      return value;
    default:
      return null;
  }
}

function parseIssueStatus(value: unknown): AgentIssueStatus | null {
  switch (value) {
    case "backlog":
    case "doing":
    case "done":
    case "todo":
      return value;
    default:
      return null;
  }
}

function parseIssuePriority(value: unknown): AgentIssuePriority | null {
  switch (value) {
    case "high":
    case "low":
    case "medium":
      return value;
    default:
      return null;
  }
}

function parseProjectType(value: unknown): AgentProjectType | null {
  switch (value) {
    case "build":
    case "life":
      return value;
    default:
      return null;
  }
}

export {
  isRecord,
  parseIssuePriority,
  parseIssueStatus,
  parseProjectType,
  parseProviderKind,
  parseTaskStatus,
  readPathArray,
  readRequiredArray,
  readRequiredPath,
  readRequiredString,
  readSafePath,
  readTitle,
  stringField,
  validateKeys,
};
export type { ValidationContext };
