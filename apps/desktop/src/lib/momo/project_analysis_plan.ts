import type { ProjectGitSummary, ProjectOsManifest } from "../project_os_fs";
import { validateProjectAnalysisPlan } from "./project_analysis_plan_validation";

type ProjectIssueStatus = "backlog" | "doing" | "done" | "todo";
type ProjectIssuePriority = "high" | "low" | "medium";

type ProjectSourceEvidence = string;

type ProjectIssueCreate = {
  readonly kind: "project_issue";
  readonly projectId: string;
  readonly title: string;
  readonly summary: string;
  readonly userOutcome: string;
  readonly nextAction: string;
  readonly status: ProjectIssueStatus;
  readonly statusReason: string;
  readonly priority: ProjectIssuePriority;
  readonly priorityReason: string;
  readonly sourceEvidence: readonly ProjectSourceEvidence[];
  readonly technicalDetails: string;
};

type ProjectIssueUpdate = {
  readonly kind: "project_issue_update";
  readonly projectId: string;
  readonly issueId: string;
  readonly summary?: string;
  readonly userOutcome?: string;
  readonly nextAction?: string;
  readonly status?: ProjectIssueStatus;
  readonly statusReason?: string;
  readonly priority?: ProjectIssuePriority;
  readonly priorityReason?: string;
  readonly sourceEvidence?: readonly ProjectSourceEvidence[];
  readonly technicalDetails?: string;
};

type ProjectAnalysisPlan = {
  readonly kind: "project_analysis";
  readonly projectId: string;
  readonly summary: string;
  readonly creates: readonly ProjectIssueCreate[];
  readonly updates: readonly ProjectIssueUpdate[];
};

type ProjectAnalysisPlanValidationResult =
  | { readonly kind: "invalid"; readonly errors: readonly string[] }
  | { readonly kind: "valid"; readonly plan: ProjectAnalysisPlan };

type ProjectAnalysisLastRunReceipt = {
  readonly status: "applied" | "failed";
  readonly summary: string;
  readonly finishedAt: string;
  readonly git?: unknown | null;
};

type ProjectAnalysisPromptInput = {
  readonly projectId: string;
  readonly projectName: string;
  readonly manifest: ProjectOsManifest;
  readonly gitSummary: ProjectGitSummary;
  readonly existingIssues: readonly string[];
  readonly lastRunReceipt: ProjectAnalysisLastRunReceipt | null;
  readonly nowIso: string;
};

function buildProjectAnalysisPrompt(input: ProjectAnalysisPromptInput): string {
  const payload = {
    project: {
      id: input.projectId,
      name: input.projectName,
      generatedAt: input.nowIso,
    },
    manifest: input.manifest,
    gitChangeSummary: input.gitSummary,
    existingProjectOsIssues: input.existingIssues,
    lastRunReceipt: input.lastRunReceipt,
    outputContract: {
      kind: "project_analysis",
      issueRequiredFields: [
        "title",
        "summary",
        "userOutcome",
        "nextAction",
        "status",
        "statusReason",
        "priority",
        "priorityReason",
        "sourceEvidence",
        "technicalDetails",
      ],
      titleRule: "Use one owner-readable sentence. Keep filenames, functions, and commit hashes out of titles.",
      scopeRule: "Use only the linked project evidence in this payload and return Project OS issue operations only.",
    },
  };
  return [
    "You are Project OS analysis. Return only a JSON ProjectAnalysisPlan.",
    "Group technical evidence by user value so project owners can decide the next action.",
    "Reject unsafe paths, outside-folder evidence, Git write intent, and developer-only issue titles.",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function parseProjectAnalysisPlanJson(
  json: string,
  expectedProjectId: string,
): ProjectAnalysisPlanValidationResult {
  try {
    const value: unknown = JSON.parse(json);
    return validateProjectAnalysisPlan(value, expectedProjectId);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { kind: "invalid", errors: ["ProjectAnalysisPlan must be valid JSON"] };
    }
    throw error;
  }
}

export { buildProjectAnalysisPrompt, parseProjectAnalysisPlanJson, validateProjectAnalysisPlan };
export type {
  ProjectAnalysisLastRunReceipt,
  ProjectAnalysisPlan,
  ProjectAnalysisPlanValidationResult,
  ProjectAnalysisPromptInput,
  ProjectIssueCreate,
  ProjectIssuePriority,
  ProjectIssueStatus,
  ProjectIssueUpdate,
  ProjectSourceEvidence,
};
