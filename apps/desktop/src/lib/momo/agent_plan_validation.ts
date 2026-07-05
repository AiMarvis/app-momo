import { parseCreate } from "./agent_plan_create_parser";
import { safeChangesFor } from "./agent_plan_safe_changes";
import type {
  AgentApprovalRequiredChange,
  AgentPlan,
  AgentPlanUpdate,
  AgentProviderMetadata,
  AgentPlanValidationResult,
} from "./agent_plan_types";
import {
  isRecord,
  parseProviderKind,
  readPathArray,
  readRequiredArray,
  readRequiredString,
  readRequiredPath,
  readSafePath,
  stringField,
  validateKeys,
  type ValidationContext,
} from "./agent_plan_validation_helpers";

const ROOT_KEYS = ["approvalRequired", "creates", "provider", "sourceNote", "summary", "updates"];
const PROVIDER_KEYS = ["fallbackApprovedAt", "fallbackFrom", "fallbackReason", "kind", "name"];

function validateOrganizeInboxAgentPlan(value: unknown): AgentPlanValidationResult {
  if (!isRecord(value)) return invalid("Agent Plan must be a JSON object");

  const errors: string[] = [];
  validateKeys(value, ROOT_KEYS, "plan", errors);

  const summary = readRequiredString(value, "summary", "plan.summary", errors);
  const sourceNote = readRequiredPath(value, "sourceNote", "plan.sourceNote", errors);
  const provider = parseProvider(value.provider, errors);
  const createsInput = readRequiredArray(value, "creates", "plan.creates", errors);
  const updatesInput = readRequiredArray(value, "updates", "plan.updates", errors);
  const approvalInput = readRequiredArray(
    value,
    "approvalRequired",
    "plan.approvalRequired",
    errors,
  );

  if (sourceNote !== null && !sourceNote.startsWith("Inbox/")) {
    errors.push("plan.sourceNote must be under Inbox/");
  }
  if (summary === null || sourceNote === null || provider === null)
    return { kind: "invalid", errors };

  const context: ValidationContext = { sourceNote, errors, seenCreatePaths: new Set() };
  const creates = createsInput.flatMap((item, index) => parseCreate(item, index, context));
  const updates = updatesInput.flatMap((item, index) => parseUpdate(item, index, context));
  const approvalRequired = approvalInput.flatMap((item, index) =>
    parseApproval(item, index, errors),
  );

  if (errors.length > 0) return { kind: "invalid", errors };

  const plan: AgentPlan = { summary, sourceNote, provider, creates, updates, approvalRequired };
  return {
    kind: "valid",
    plan,
    safeChanges: safeChangesFor(plan),
    approvalRequired,
  };
}

function parseProvider(value: unknown, errors: string[]): AgentProviderMetadata | null {
  if (!isRecord(value)) {
    errors.push("plan.provider must be an object");
    return null;
  }
  validateKeys(value, PROVIDER_KEYS, "plan.provider", errors);
  const kind = parseProviderKind(value.kind);
  const name = readRequiredString(value, "name", "plan.provider.name", errors);
  const fallbackFrom = parseProviderKind(value.fallbackFrom);
  if (kind === null) errors.push("plan.provider.kind must be codex_cli or openai_api");
  if (value.fallbackFrom !== undefined && fallbackFrom === null) {
    errors.push("plan.provider.fallbackFrom must be codex_cli or openai_api");
  }
  if (kind === null || name === null || (value.fallbackFrom !== undefined && fallbackFrom === null))
    return null;
  return {
    kind,
    name,
    ...(fallbackFrom ? { fallbackFrom } : {}),
    ...stringField(value.fallbackReason, "fallbackReason"),
    ...stringField(value.fallbackApprovedAt, "fallbackApprovedAt"),
  };
}

function parseUpdate(
  value: unknown,
  index: number,
  context: ValidationContext,
): readonly AgentPlanUpdate[] {
  const label = `updates[${index}]`;
  if (!isRecord(value)) {
    context.errors.push(`${label} must be an object`);
    return [];
  }
  validateKeys(value, ["kind", "organizedInto", "sourceNote"], label, context.errors);
  if (value.kind !== "mark_inbox_processed") {
    context.errors.push(`${label}.kind is unsupported`);
    return [];
  }
  const sourceNote = readSourceNote(value, label, context);
  const organizedInto = readPathArray(
    value.organizedInto,
    `${label}.organizedInto`,
    context.errors,
  );
  if (sourceNote === null) return [];
  return [{ kind: "mark_inbox_processed", sourceNote, organizedInto }];
}

function parseApproval(
  value: unknown,
  index: number,
  errors: string[],
): readonly AgentApprovalRequiredChange[] {
  const label = `approvalRequired[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return [];
  }
  validateKeys(value, ["kind", "path", "summary"], label, errors);
  const kind = parseApprovalKind(value.kind);
  const summary = readRequiredString(value, "summary", `${label}.summary`, errors);
  const path = value.path === undefined ? null : readSafePath(value.path, `${label}.path`, errors);
  if (kind === null) errors.push(`${label}.kind is unsupported`);
  if (kind === null || summary === null) return [];
  return [{ kind, summary, ...(path ? { path } : {}) }];
}

function readSourceNote(
  value: Readonly<Record<string, unknown>>,
  label: string,
  context: ValidationContext,
): string | null {
  const sourceNote = readRequiredPath(value, "sourceNote", `${label}.sourceNote`, context.errors);
  if (sourceNote !== null && sourceNote !== context.sourceNote) {
    context.errors.push(`${label}.sourceNote must match plan sourceNote`);
  }
  return sourceNote;
}

function parseApprovalKind(value: unknown): AgentApprovalRequiredChange["kind"] | null {
  switch (value) {
    case "delete":
    case "destructive_calendar_change":
    case "existing_note_update":
    case "external_sync":
    case "large_body_replacement":
    case "move":
    case "rename":
      return value;
    default:
      return null;
  }
}

function invalid(error: string): AgentPlanValidationResult {
  return { kind: "invalid", errors: [error] };
}

export { validateOrganizeInboxAgentPlan };
