import type {
  ProjectIssuePriority,
  ProjectIssueStatus,
  ProjectSourceEvidence,
} from "./project_analysis_plan";
import {
  isAbstractTitle,
  isDeveloperOnlyTitle,
  isGitMetadataTitle,
} from "./project_analysis_title_validation";
import {
  hasGitWriteIntent,
  hasSecondBrainReference,
  sourcePathError,
} from "./project_analysis_plan_path_safety";

type RecordValue = Readonly<Record<string, unknown>>;
type ValidationContext = {
  readonly expectedProjectId: string;
  readonly errors: string[];
};

function projectIdFor(value: unknown, label: string, context: ValidationContext): string | null {
  const projectId = requiredString(value, label, context);
  if (projectId !== null && projectId !== context.expectedProjectId) {
    context.errors.push(`${label} must match requested projectId`);
  }
  return projectId;
}

function userText(value: unknown, label: string, context: ValidationContext): string | null {
  const text = requiredString(value, label, context);
  if (text !== null && isOverTechnical(text)) {
    context.errors.push(`${label} must be written for a project user, not as technical diagnostics`);
  }
  if (text !== null) validateAgentResultText(text, label, context);
  return text;
}

function optionalUserText(
  value: unknown,
  label: string,
  context: ValidationContext,
): string | undefined | null {
  return value === undefined ? undefined : userText(value, label, context);
}

function requiredString(value: unknown, label: string, context: ValidationContext): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  context.errors.push(`${label} must be a non-empty string`);
  return null;
}

function requiredArray(value: unknown, label: string, context: ValidationContext): readonly unknown[] {
  if (Array.isArray(value)) return value;
  context.errors.push(`${label} must be an array`);
  return [];
}

function sourceEvidenceArray(
  value: unknown,
  label: string,
  context: ValidationContext,
): readonly ProjectSourceEvidence[] | null {
  if (!Array.isArray(value)) {
    context.errors.push(`${label} must be an array`);
    return null;
  }
  return value.flatMap((item, index) => sourceEvidencePath(item, `${label}[${index}]`, context));
}

function sourceEvidencePath(
  value: unknown,
  label: string,
  context: ValidationContext,
): readonly ProjectSourceEvidence[] {
  const path = requiredString(value, label, context);
  if (path === null) return [];
  const pathError = sourcePathError(path);
  if (pathError === "second_brain") {
    context.errors.push(`${label} must not reference second-brain paths`);
  }
  if (pathError === "unsafe") context.errors.push(`${label} must be a safe project-relative path`);
  return [path];
}

function statusFor(value: unknown, label: string, context: ValidationContext): ProjectIssueStatus | null {
  switch (value) {
    case "backlog":
    case "doing":
    case "done":
    case "todo":
      return value;
    default:
      context.errors.push(`${label} must be backlog, todo, doing, or done`);
      return null;
  }
}

function priorityFor(value: unknown, label: string, context: ValidationContext): ProjectIssuePriority | null {
  switch (value) {
    case "high":
    case "low":
    case "medium":
      return value;
    default:
      context.errors.push(`${label} must be low, medium, or high`);
      return null;
  }
}

function validateTitle(title: string, label: string, context: ValidationContext): void {
  if (isDeveloperOnlyTitle(title)) {
    context.errors.push(`${label} must describe user-visible work, not a file/function/error`);
  }
  if (isGitMetadataTitle(title)) {
    context.errors.push(`${label} must describe user-visible work, not Git metadata`);
  }
  if (isAbstractTitle(title)) {
    context.errors.push(`${label} must name a concrete project issue`);
  }
}

function validateAgentResultText(text: string, label: string, context: ValidationContext): void {
  if (hasGitWriteIntent(text)) {
    context.errors.push(`${label} must not request Git write actions`);
  }
  if (hasSecondBrainReference(text)) {
    context.errors.push(`${label} must not reference second-brain paths`);
  }
}

function isOverTechnical(value: string): boolean {
  return /(?:\b(?:exception|function|null pointer|ReferenceError|stack trace|SyntaxError|TypeError|undefined)\b|(?:^|\/)[^/\s]+\.(?:cts|go|js|jsx|mts|py|rs|ts|tsx)\b|[A-Za-z_$][\w$]*\(\))/i.test(
    value,
  );
}

function isNonActionable(value: string): boolean {
  const normalized = normalizeText(value);
  return (
    NON_ACTIONS.has(normalized) ||
    /\b(?:do something|figure it out|fix it|handle it|look into it|tbd|to be decided|work on it)\b/i.test(
      normalized,
    ) ||
    /\b(?:later|someday|eventually)\b/i.test(normalized) ||
    /(?:나중|언젠가|추후)\s*(?:논의|검토|처리|확인)?/.test(normalized)
  );
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushError(context: ValidationContext, error: string): readonly [] {
  context.errors.push(error);
  return [];
}

const NON_ACTIONS = new Set(["discuss later", "do something", "fix it", "tbd", "나중에 처리", "추후 논의"]);
export {
  isNonActionable,
  isRecord,
  optionalUserText,
  priorityFor,
  projectIdFor,
  pushError,
  requiredArray,
  requiredString,
  sourceEvidenceArray,
  statusFor,
  userText,
  validateAgentResultText,
  validateTitle,
};
export type { ValidationContext };
