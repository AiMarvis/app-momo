import type {
  AgentApprovalRequiredChange,
  AgentPlan,
  AgentPlanCreate,
  AgentProviderMetadata,
} from "./agent_plan_types";

type AgentReceiptInput =
  | {
      readonly kind: "applied";
      readonly plan: AgentPlan;
      readonly runLogPath?: string;
      readonly undoPlanPath?: string;
    }
  | {
      readonly kind: "invalid_plan";
      readonly sourceNote: string;
      readonly provider: AgentProviderMetadata;
      readonly validationErrors: readonly string[];
      readonly runLogPath?: string;
    };

interface AgentReceiptItem {
  readonly title: string;
  readonly detail: string;
  readonly path?: string;
}

interface AgentReceiptSection {
  readonly title: string;
  readonly items: readonly AgentReceiptItem[];
}

interface AgentReceipt {
  readonly kind: AgentReceiptInput["kind"];
  readonly title: string;
  readonly summary: string;
  readonly providerNote: string | null;
  readonly sections: readonly AgentReceiptSection[];
  readonly visibleText: string;
}

function providerFallbackNote(provider: AgentProviderMetadata): string | null {
  if (provider.kind === "openai_api" && provider.fallbackFrom !== undefined) {
    return "OpenAI API fallback used after approval.";
  }
  return null;
}

function buildAgentReceipt(input: AgentReceiptInput): AgentReceipt {
  if (input.kind === "invalid_plan") {
    const sections = [
      {
        title: "Validation summary",
        items: input.validationErrors.map((error) => ({
          title: error,
          detail: "No vault changes applied",
          ...(input.runLogPath ? { path: input.runLogPath } : {}),
        })),
      },
    ];
    return receipt({
      kind: input.kind,
      title: "Plan needs review",
      summary: "Organize Inbox stopped before applying changes.",
      providerNote: providerFallbackNote(input.provider),
      sections,
    });
  }

  const sections = [
    receiptSection("Created Tasks", input.plan.creates, isManagedTask, itemForCreate),
    receiptSection("Created Issues", input.plan.creates, isBuildIssue, itemForCreate),
    receiptSection("Suggested Schedule", input.plan.creates, isScheduleSuggestion, itemForCreate),
    receiptSection("New or Linked Projects", input.plan.creates, isProjectOrLink, itemForCreate),
    {
      title: "Needs approval",
      items: input.plan.approvalRequired.map(itemForApproval),
    },
    {
      title: "Undo",
      items: [
        {
          title: "Whole-run undo is available",
          detail: "Undo Plan",
          ...(input.undoPlanPath ? { path: input.undoPlanPath } : {}),
        },
      ],
    },
  ].filter((candidate) => candidate.items.length > 0);

  return receipt({
    kind: input.kind,
    title: "Change receipt",
    summary: input.plan.summary,
    providerNote: providerFallbackNote(input.plan.provider),
    sections,
  });
}

function receipt(input: {
  readonly kind: AgentReceiptInput["kind"];
  readonly title: string;
  readonly summary: string;
  readonly providerNote: string | null;
  readonly sections: readonly AgentReceiptSection[];
}): AgentReceipt {
  return {
    ...input,
    visibleText: [
      input.title,
      input.summary,
      input.providerNote,
      ...input.sections.flatMap((entry) => [
        entry.title,
        ...entry.items.flatMap((item) => [item.title, item.detail]),
      ]),
    ]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join("\n"),
  };
}

function receiptSection<T extends AgentPlanCreate>(
  title: string,
  creates: readonly AgentPlanCreate[],
  guard: (create: AgentPlanCreate) => create is T,
  map: (create: T) => AgentReceiptItem,
): AgentReceiptSection {
  return {
    title,
    items: creates.filter(guard).map(map),
  };
}

function isManagedTask(
  create: AgentPlanCreate,
): create is Extract<AgentPlanCreate, { kind: "managed_task" }> {
  return create.kind === "managed_task";
}

function isBuildIssue(
  create: AgentPlanCreate,
): create is Extract<AgentPlanCreate, { kind: "build_issue" }> {
  return create.kind === "build_issue";
}

function isScheduleSuggestion(
  create: AgentPlanCreate,
): create is Extract<AgentPlanCreate, { kind: "planning_candidate" | "schedule_block" }> {
  return create.kind === "schedule_block" || create.kind === "planning_candidate";
}

function isProjectOrLink(
  create: AgentPlanCreate,
): create is Extract<AgentPlanCreate, { kind: "note_link" | "project" }> {
  return create.kind === "project" || create.kind === "note_link";
}

function itemForCreate(create: AgentPlanCreate): AgentReceiptItem {
  switch (create.kind) {
    case "managed_task":
      return { title: create.title, detail: "Managed Task", path: create.path };
    case "build_issue":
      return { title: create.title, detail: "Build Issue", path: create.path };
    case "project":
      return {
        title: create.title,
        detail: create.projectType === "life" ? "Life Project" : "Build Project",
        path: create.path,
      };
    case "schedule_block":
      return { title: create.title, detail: "Schedule Block", path: create.path };
    case "planning_candidate":
      return { title: create.title, detail: "Planning Candidate", path: create.path };
    case "note_link":
      return { title: create.title, detail: "Linked note", path: create.target };
  }
  return assertNeverCreate(create);
}

function assertNeverCreate(_create: never): never {
  throw new Error("Unhandled Agent Plan create kind");
}

function itemForApproval(change: AgentApprovalRequiredChange): AgentReceiptItem {
  return {
    title: change.summary,
    detail: "Held for approval",
    ...(change.path ? { path: change.path } : {}),
  };
}

export { buildAgentReceipt, providerFallbackNote };
export type { AgentReceipt, AgentReceiptInput, AgentReceiptItem, AgentReceiptSection };
