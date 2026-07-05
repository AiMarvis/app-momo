type FrontmatterValue = boolean | string;
type FrontmatterFields = Record<string, FrontmatterValue>;

type ProjectType = "build" | "life";
type TaskStatus = "done" | "todo";
type IssueStatus = "backlog" | "doing" | "done" | "todo";
type IssuePriority = "high" | "low" | "medium";

interface InvalidMomoDomainNote {
  readonly kind: "invalid";
  readonly path: string;
  readonly issues: readonly string[];
}

type MomoDomainNote =
  | { readonly kind: "project"; readonly path: string; readonly projectType: ProjectType }
  | {
      readonly kind: "task";
      readonly path: string;
      readonly status: TaskStatus;
      readonly important: boolean;
    }
  | {
      readonly kind: "issue";
      readonly path: string;
      readonly status: IssueStatus;
      readonly priority: IssuePriority;
      readonly blocked: boolean;
    }
  | {
      readonly kind: "schedule_block";
      readonly path: string;
      readonly start: string;
      readonly end: string;
    }
  | { readonly kind: "planning_candidate"; readonly path: string }
  | { readonly kind: "inbox_note"; readonly path: string }
  | { readonly kind: "processed_inbox_note"; readonly path: string; readonly agentRun: string }
  | { readonly kind: "run_log"; readonly path: string; readonly status: string };

type MomoDomainParseResult =
  | InvalidMomoDomainNote
  | MomoDomainNote
  | { readonly kind: "none"; readonly path: string };

interface MomoDomainQueryResult {
  readonly items: readonly MomoDomainNote[];
  readonly invalid: readonly InvalidMomoDomainNote[];
}

interface MomoMarkdownNote {
  readonly path: string;
  readonly markdown: string;
}

type FrontmatterParseResult =
  | { readonly kind: "none" }
  | { readonly kind: "invalid"; readonly issues: readonly string[] }
  | { readonly kind: "parsed"; readonly fields: FrontmatterFields };

function cleanVaultPath(path: string): string {
  return path.replace(/^\/+/, "");
}

function isInboxPath(path: string): boolean {
  const clean = cleanVaultPath(path);
  return clean === "Inbox" || clean.startsWith("Inbox/");
}

function isRunLogPath(path: string): boolean {
  const clean = cleanVaultPath(path);
  return clean === ".AgentRuns" || clean.startsWith(".AgentRuns/");
}

function parseTaskStatus(value: FrontmatterValue | undefined): TaskStatus | null {
  switch (value) {
    case "done":
    case "todo":
      return value;
    default:
      return null;
  }
}

function parseIssueStatus(value: FrontmatterValue | undefined): IssueStatus | null {
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

function parseIssuePriority(value: FrontmatterValue | undefined): IssuePriority | null {
  switch (value) {
    case "high":
    case "low":
    case "medium":
      return value;
    default:
      return null;
  }
}

function parseProjectType(value: FrontmatterValue | undefined): ProjectType | null {
  switch (value) {
    case "build":
    case "life":
      return value;
    default:
      return null;
  }
}

function parseFrontmatter(markdown: string): FrontmatterParseResult {
  const lines = markdown.split(/\r?\n/);
  if (lines[0] !== "---") return { kind: "none" };

  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  if (end === -1) return { kind: "invalid", issues: ["frontmatter is missing a closing marker"] };

  const fields: FrontmatterFields = {};
  const issues: string[] = [];
  for (let index = 1; index < end; index++) {
    const line = lines[index].trim();
    if (line === "" || line.startsWith("#")) continue;

    const separator = line.indexOf(":");
    if (separator === -1) {
      issues.push(`frontmatter line ${index} is missing a ':' separator`);
      continue;
    }

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (key === "") {
      issues.push(`frontmatter line ${index} has an empty key`);
      continue;
    }
    if (Object.hasOwn(fields, key)) {
      issues.push(`frontmatter key '${key}' is duplicated`);
      continue;
    }
    fields[key] = parseFrontmatterValue(rawValue);
  }

  return issues.length > 0 ? { kind: "invalid", issues } : { kind: "parsed", fields };
}

function parseFrontmatterValue(value: string): FrontmatterValue {
  if (value === "true") return true;
  if (value === "false") return false;
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function asString(value: FrontmatterValue | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseMomoDomainNote(path: string, markdown: string): MomoDomainParseResult {
  const frontmatter = parseFrontmatter(markdown);
  if (frontmatter.kind === "invalid") return { kind: "invalid", path, issues: frontmatter.issues };
  if (frontmatter.kind === "none") {
    return isInboxPath(path) ? { kind: "inbox_note", path } : { kind: "none", path };
  }

  const { fields } = frontmatter;
  if (isInboxPath(path) && fields.processed === true) {
    const agentRun = asString(fields.agent_run);
    return agentRun
      ? { kind: "processed_inbox_note", path, agentRun }
      : { kind: "invalid", path, issues: ["processed inbox note must include agent_run"] };
  }

  const type = asString(fields.type);
  if (!type) return isInboxPath(path) ? { kind: "inbox_note", path } : { kind: "none", path };

  switch (type) {
    case "project":
      return parseProject(path, fields);
    case "task":
      return parseTask(path, fields);
    case "issue":
      return parseIssue(path, fields);
    case "schedule_block":
      return parseScheduleBlock(path, fields);
    case "planning_candidate":
      return { kind: "planning_candidate", path };
    case "run_log":
      return parseRunLog(path, fields);
    default:
      return isRunLogPath(path)
        ? { kind: "invalid", path, issues: ["run log type is unsupported"] }
        : { kind: "none", path };
  }
}

function parseProject(path: string, fields: FrontmatterFields): MomoDomainParseResult {
  const projectType = parseProjectType(fields.project_type);
  return projectType
    ? { kind: "project", path, projectType }
    : { kind: "invalid", path, issues: ["project_type must be life or build"] };
}

function parseTask(path: string, fields: FrontmatterFields): MomoDomainParseResult {
  const status = parseTaskStatus(fields.status);
  if (status === null || fields.priority !== undefined) {
    const issues: string[] = [];
    if (status === null) issues.push("task status must be todo or done");
    if (fields.priority !== undefined) issues.push("task cannot use issue priority");
    return { kind: "invalid", path, issues };
  }
  return { kind: "task", path, status, important: fields.important === true };
}

function parseIssue(path: string, fields: FrontmatterFields): MomoDomainParseResult {
  const status = parseIssueStatus(fields.status);
  const priority = parseIssuePriority(fields.priority);
  const isLifeIssue = fields.project_type === "life";
  if (status === null || priority === null || isLifeIssue) {
    const issues: string[] = [];
    if (status === null) issues.push("issue status must be backlog, todo, doing, or done");
    if (priority === null) issues.push("issue priority must be low, medium, or high");
    if (isLifeIssue) issues.push("issue cannot belong to a life project");
    return { kind: "invalid", path, issues };
  }
  return { kind: "issue", path, status, priority, blocked: fields.blocked === true };
}

function parseScheduleBlock(path: string, fields: FrontmatterFields): MomoDomainParseResult {
  const start = asString(fields.start);
  const end = asString(fields.end);
  return start && end
    ? { kind: "schedule_block", path, start, end }
    : { kind: "invalid", path, issues: ["schedule block must include start and end"] };
}

function parseRunLog(path: string, fields: FrontmatterFields): MomoDomainParseResult {
  const status = asString(fields.status);
  return status
    ? { kind: "run_log", path, status }
    : { kind: "invalid", path, issues: ["run log must include status"] };
}

function queryMomoDomainNotes(notes: readonly MomoMarkdownNote[]): MomoDomainQueryResult {
  const items: MomoDomainNote[] = [];
  const invalid: InvalidMomoDomainNote[] = [];
  for (const note of notes) {
    const parsed = parseMomoDomainNote(note.path, note.markdown);
    switch (parsed.kind) {
      case "invalid":
        invalid.push(parsed);
        break;
      case "none":
        break;
      default:
        items.push(parsed);
        break;
    }
  }
  return { items, invalid };
}

export { parseMomoDomainNote, queryMomoDomainNotes };
export type {
  InvalidMomoDomainNote,
  MomoDomainNote,
  MomoDomainParseResult,
  MomoDomainQueryResult,
  MomoMarkdownNote,
};
