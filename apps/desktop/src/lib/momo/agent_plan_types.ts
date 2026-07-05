type AgentProviderKind = "codex_cli" | "openai_api";
type AgentProjectType = "build" | "life";
type AgentTaskStatus = "done" | "todo";
type AgentIssueStatus = "backlog" | "doing" | "done" | "todo";
type AgentIssuePriority = "high" | "low" | "medium";

interface AgentProviderMetadata {
  readonly kind: AgentProviderKind;
  readonly name: string;
  readonly fallbackFrom?: AgentProviderKind;
  readonly fallbackReason?: string;
  readonly fallbackApprovedAt?: string;
}

interface AgentManagedTaskCreate {
  readonly kind: "managed_task";
  readonly title: string;
  readonly sourceNote: string;
  readonly status: AgentTaskStatus;
  readonly path: string;
  readonly important: boolean;
  readonly due?: string;
  readonly project?: string;
}

interface AgentBuildIssueCreate {
  readonly kind: "build_issue";
  readonly title: string;
  readonly sourceNote: string;
  readonly status: AgentIssueStatus;
  readonly priority: AgentIssuePriority;
  readonly path: string;
  readonly blocked: boolean;
  readonly due?: string;
  readonly project?: string;
}

interface AgentProjectCreate {
  readonly kind: "project";
  readonly title: string;
  readonly sourceNote: string;
  readonly projectType: AgentProjectType;
  readonly path: string;
}

interface AgentScheduleBlockCreate {
  readonly kind: "schedule_block";
  readonly title: string;
  readonly sourceNote: string;
  readonly start: string;
  readonly end: string;
  readonly path: string;
}

interface AgentPlanningCandidateCreate {
  readonly kind: "planning_candidate";
  readonly title: string;
  readonly sourceNote: string;
  readonly path: string;
}

interface AgentNoteLinkCreate {
  readonly kind: "note_link";
  readonly title: string;
  readonly sourceNote: string;
  readonly target: string;
  readonly relation: "related" | "source";
}

type AgentPlanCreate =
  | AgentBuildIssueCreate
  | AgentManagedTaskCreate
  | AgentNoteLinkCreate
  | AgentPlanningCandidateCreate
  | AgentProjectCreate
  | AgentScheduleBlockCreate;

interface AgentMarkInboxProcessedUpdate {
  readonly kind: "mark_inbox_processed";
  readonly sourceNote: string;
  readonly organizedInto: readonly string[];
}

type AgentPlanUpdate = AgentMarkInboxProcessedUpdate;

interface AgentApprovalRequiredChange {
  readonly kind:
    | "delete"
    | "destructive_calendar_change"
    | "existing_note_update"
    | "external_sync"
    | "large_body_replacement"
    | "move"
    | "rename";
  readonly summary: string;
  readonly path?: string;
}

interface AgentPlan {
  readonly summary: string;
  readonly sourceNote: string;
  readonly provider: AgentProviderMetadata;
  readonly creates: readonly AgentPlanCreate[];
  readonly updates: readonly AgentPlanUpdate[];
  readonly approvalRequired: readonly AgentApprovalRequiredChange[];
}

interface AgentSafeChange {
  readonly kind: "create" | "link" | "update_source_note";
  readonly itemKind: AgentPlanCreate["kind"] | "mark_inbox_processed";
  readonly path: string;
}

type AgentPlanValidationResult =
  | {
      readonly kind: "invalid";
      readonly errors: readonly string[];
    }
  | {
      readonly kind: "valid";
      readonly plan: AgentPlan;
      readonly safeChanges: readonly AgentSafeChange[];
      readonly approvalRequired: readonly AgentApprovalRequiredChange[];
    };

interface FailedValidationRunInput {
  readonly sourceNote: string;
  readonly provider: AgentProviderMetadata;
  readonly validationErrors: readonly string[];
}

interface FailedValidationRunResult {
  readonly runLogPath: string;
  readonly runLogMarkdown: string;
  readonly vaultChanges: readonly [
    {
      readonly kind: "write_failed_run_log";
      readonly path: string;
    },
  ];
}

export type {
  AgentApprovalRequiredChange,
  AgentBuildIssueCreate,
  AgentIssuePriority,
  AgentIssueStatus,
  AgentManagedTaskCreate,
  AgentPlan,
  AgentPlanCreate,
  AgentPlanUpdate,
  AgentProjectType,
  AgentProviderKind,
  AgentProviderMetadata,
  AgentSafeChange,
  AgentTaskStatus,
  AgentPlanValidationResult,
  FailedValidationRunInput,
  FailedValidationRunResult,
};
