import type { AgentReceipt } from "./agent_receipt";
import type { AgentPlan, AgentPlanCreate } from "./agent_plan_types";

function createdFilePaths(plan: AgentPlan): readonly string[] {
  return plan.creates.flatMap((create) => (create.kind === "note_link" ? [] : [create.path]));
}

function organizedInto(plan: AgentPlan): readonly string[] {
  const fromUpdate =
    plan.updates.find((update) => update.kind === "mark_inbox_processed")?.organizedInto ?? [];
  return fromUpdate.length > 0 ? fromUpdate : createdFilePaths(plan);
}

function markdownForCreate(
  create: Exclude<AgentPlanCreate, { readonly kind: "note_link" }>,
): string {
  switch (create.kind) {
    case "managed_task":
      return frontmatter(
        [
          ["type", "task"],
          ["status", create.status],
          ["important", create.important ? "true" : "false"],
          ["source_note", create.sourceNote],
          ...optionalField("due", create.due),
          ...optionalField("project", create.project),
        ],
        create.title,
      );
    case "build_issue":
      return frontmatter(
        [
          ["type", "issue"],
          ["status", create.status],
          ["priority", create.priority],
          ["blocked", create.blocked ? "true" : "false"],
          ["source_note", create.sourceNote],
          ...optionalField("due", create.due),
          ...optionalField("project", create.project),
        ],
        create.title,
      );
    case "project":
      return frontmatter(
        [
          ["type", "project"],
          ["project_type", create.projectType],
          ["source_note", create.sourceNote],
        ],
        create.title,
      );
    case "schedule_block":
      return frontmatter(
        [
          ["type", "schedule_block"],
          ["start", create.start],
          ["end", create.end],
          ["source_note", create.sourceNote],
        ],
        create.title,
      );
    case "planning_candidate":
      return frontmatter(
        [
          ["type", "planning_candidate"],
          ["source_note", create.sourceNote],
        ],
        create.title,
      );
  }
  return assertNeverCreate(create);
}

function runLogMarkdown(plan: AgentPlan, nowIso: string): string {
  return [
    "---",
    "type: run_log",
    "status: applied",
    `source_note: ${plan.sourceNote}`,
    `provider: ${plan.provider.kind}`,
    `created_at: ${nowIso}`,
    "---",
    "",
    "# Organize Inbox Run Log",
    "",
    "## Created",
    ...createdFilePaths(plan).map((path) => `- ${path}`),
    "",
  ].join("\n");
}

function receiptMarkdown(receipt: AgentReceipt): string {
  return [`# ${receipt.title}`, "", receipt.visibleText, ""].join("\n");
}

function undoPlanMarkdown(plan: AgentPlan, runLogPath: string): string {
  return [
    "---",
    "type: undo_plan",
    `run_log: ${runLogPath}`,
    "---",
    "",
    "# Undo Plan",
    "",
    ...createdFilePaths(plan).map((path) => `- delete_created_file: ${path}`),
    `- restore_source_note: ${plan.sourceNote}`,
    "",
  ].join("\n");
}

function processedSourceMarkdown(input: {
  readonly sourceMarkdown: string;
  readonly runLogPath: string;
  readonly organizedInto: readonly string[];
}): string {
  return [
    "---",
    "processed: true",
    `agent_run: ${input.runLogPath}`,
    "---",
    "",
    sourceBody(input.sourceMarkdown),
    "",
    "## Organized into",
    ...input.organizedInto.map((path) => `- [[${pathToWikiLink(path)}]]`),
    "",
  ].join("\n");
}

function safeTimestamp(iso: string): string {
  return iso.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-+|-+$/g, "");
}

function frontmatter(fields: readonly (readonly [string, string])[], title: string): string {
  return [
    "---",
    ...fields.map(([key, value]) => `${key}: ${value}`),
    "---",
    "",
    `# ${title}`,
    "",
  ].join("\n");
}

function optionalField(
  key: string,
  value: string | undefined,
): readonly (readonly [string, string])[] {
  return value === undefined ? [] : [[key, value]];
}

function sourceBody(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  if (lines[0] !== "---") return markdown;
  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  return end === -1
    ? markdown
    : lines
        .slice(end + 1)
        .join("\n")
        .trimStart();
}

function pathToWikiLink(path: string): string {
  return path.endsWith(".md") ? path.slice(0, -3) : path;
}

function assertNeverCreate(_create: never): never {
  throw new Error("Unhandled Agent Plan create kind");
}

export {
  createdFilePaths,
  markdownForCreate,
  organizedInto,
  processedSourceMarkdown,
  receiptMarkdown,
  runLogMarkdown,
  safeTimestamp,
  undoPlanMarkdown,
};
