import type {
  AgentBuildIssueCreate,
  AgentManagedTaskCreate,
  AgentPlanCreate,
} from "./agent_plan_types";
import {
  isRecord,
  parseIssuePriority,
  parseIssueStatus,
  parseProjectType,
  parseTaskStatus,
  readRequiredPath,
  readRequiredString,
  readSafePath,
  readTitle,
  stringField,
  validateKeys,
  type ValidationContext,
} from "./agent_plan_validation_helpers";

function parseCreate(
  value: unknown,
  index: number,
  context: ValidationContext,
): readonly AgentPlanCreate[] {
  const label = `creates[${index}]`;
  if (!isRecord(value)) {
    context.errors.push(`${label} must be an object`);
    return [];
  }
  const kind = readRequiredString(value, "kind", `${label}.kind`, context.errors);
  switch (kind) {
    case "managed_task":
      return parseManagedTask(value, label, context);
    case "build_issue":
      return parseBuildIssue(value, label, context);
    case "project":
      return parseProject(value, label, context);
    case "schedule_block":
      return parseScheduleBlock(value, label, context);
    case "planning_candidate":
      return parsePlanningCandidate(value, label, context);
    case "note_link":
      return parseNoteLink(value, label, context);
    default:
      context.errors.push(`${label}.kind is unsupported`);
      return [];
  }
}

function parseManagedTask(
  value: Readonly<Record<string, unknown>>,
  label: string,
  context: ValidationContext,
): readonly AgentManagedTaskCreate[] {
  validateKeys(
    value,
    ["due", "important", "kind", "path", "project", "sourceNote", "status", "title"],
    label,
    context.errors,
  );
  const title = readTitle(value, label, context.errors);
  const sourceNote = readSourceNote(value, label, context);
  const status = parseTaskStatus(value.status);
  const path = readCreatePath(value, label, context);
  if (status === null) context.errors.push(`${label}.status must be todo or done`);
  if (title === null || sourceNote === null || status === null || path === null) return [];
  return [
    {
      kind: "managed_task",
      title,
      sourceNote,
      status,
      path,
      important: value.important === true,
      ...stringField(value.due, "due"),
      ...stringField(value.project, "project"),
    },
  ];
}

function parseBuildIssue(
  value: Readonly<Record<string, unknown>>,
  label: string,
  context: ValidationContext,
): readonly AgentBuildIssueCreate[] {
  validateKeys(
    value,
    ["blocked", "due", "kind", "path", "priority", "project", "sourceNote", "status", "title"],
    label,
    context.errors,
  );
  const title = readTitle(value, label, context.errors);
  const sourceNote = readSourceNote(value, label, context);
  const status = parseIssueStatus(value.status);
  const priority = parseIssuePriority(value.priority);
  const path = readCreatePath(value, label, context);
  if (status === null) context.errors.push(`${label}.status must be backlog, todo, doing, or done`);
  if (priority === null) context.errors.push(`${label}.priority must be low, medium, or high`);
  if (
    title === null ||
    sourceNote === null ||
    status === null ||
    priority === null ||
    path === null
  ) {
    return [];
  }
  return [
    {
      kind: "build_issue",
      title,
      sourceNote,
      status,
      priority,
      path,
      blocked: value.blocked === true,
      ...stringField(value.due, "due"),
      ...stringField(value.project, "project"),
    },
  ];
}

function parseProject(
  value: Readonly<Record<string, unknown>>,
  label: string,
  context: ValidationContext,
): readonly AgentPlanCreate[] {
  validateKeys(
    value,
    ["kind", "path", "projectType", "sourceNote", "title"],
    label,
    context.errors,
  );
  const title = readTitle(value, label, context.errors);
  const sourceNote = readSourceNote(value, label, context);
  const projectType = parseProjectType(value.projectType);
  const path = readCreatePath(value, label, context);
  if (projectType === null) context.errors.push(`${label}.projectType must be life or build`);
  if (title === null || sourceNote === null || projectType === null || path === null) return [];
  return [{ kind: "project", title, sourceNote, projectType, path }];
}

function parseScheduleBlock(
  value: Readonly<Record<string, unknown>>,
  label: string,
  context: ValidationContext,
): readonly AgentPlanCreate[] {
  validateKeys(
    value,
    ["end", "kind", "path", "sourceNote", "start", "title"],
    label,
    context.errors,
  );
  const title = readTitle(value, label, context.errors);
  const sourceNote = readSourceNote(value, label, context);
  const start = readRequiredString(value, "start", `${label}.start`, context.errors);
  const end = readRequiredString(value, "end", `${label}.end`, context.errors);
  const path = readCreatePath(value, label, context);
  if (title === null || sourceNote === null || start === null || end === null || path === null)
    return [];
  return [{ kind: "schedule_block", title, sourceNote, start, end, path }];
}

function parsePlanningCandidate(
  value: Readonly<Record<string, unknown>>,
  label: string,
  context: ValidationContext,
): readonly AgentPlanCreate[] {
  validateKeys(value, ["kind", "path", "sourceNote", "title"], label, context.errors);
  const title = readTitle(value, label, context.errors);
  const sourceNote = readSourceNote(value, label, context);
  const path = readCreatePath(value, label, context);
  if (title === null || sourceNote === null || path === null) return [];
  return [{ kind: "planning_candidate", title, sourceNote, path }];
}

function parseNoteLink(
  value: Readonly<Record<string, unknown>>,
  label: string,
  context: ValidationContext,
): readonly AgentPlanCreate[] {
  validateKeys(value, ["kind", "relation", "sourceNote", "target", "title"], label, context.errors);
  const title = readTitle(value, label, context.errors);
  const sourceNote = readSourceNote(value, label, context);
  const target = readSafePath(value.target, `${label}.target`, context.errors);
  const relation =
    value.relation === "source" || value.relation === "related" ? value.relation : null;
  if (relation === null) context.errors.push(`${label}.relation must be source or related`);
  if (title === null || sourceNote === null || target === null || relation === null) return [];
  return [{ kind: "note_link", title, sourceNote, target, relation }];
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

function readCreatePath(
  value: Readonly<Record<string, unknown>>,
  label: string,
  context: ValidationContext,
): string | null {
  const path = readRequiredPath(value, "path", `${label}.path`, context.errors);
  if (path === null) return null;
  if (context.seenCreatePaths.has(path))
    context.errors.push(`${label}.path duplicates another create`);
  context.seenCreatePaths.add(path);
  return path;
}

export { parseCreate };
