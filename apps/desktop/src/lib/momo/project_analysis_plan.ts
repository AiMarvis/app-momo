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

type ProjectAnalysisPromptInput = {
  readonly projectId: string;
  readonly projectName: string;
  readonly issueLanguage: string;
  readonly projectManifest: string;
  readonly existingIssues: readonly string[];
  readonly nowIso: string;
};

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

function buildProjectAnalysisPrompt(input: ProjectAnalysisPromptInput): string {
  return [
    "Return only one ProjectAnalysisPlan JSON object. Do not include Markdown fences or commentary.",
    `Project id: ${input.projectId}`,
    `Project: ${input.projectName}`,
    `Generated at: ${input.nowIso}`,
    `Write all user-facing issue fields in ${input.issueLanguage}.`,
    "Create or update Project OS issues only for this project.",
    "Write for project owners, planners, and non-developer operators first.",
    "Do not use file names, function names, stack traces, or internal error names as titles.",
    "Every issue must say what to do, why it matters, what the user or project gains, and the next action.",
    "Keep implementation hints only in technicalDetails.",
    "Use project-relative sourceEvidence path strings only; do not use second-brain vault paths.",
    "Required root shape:",
    JSON.stringify(
      {
        kind: "project_analysis",
        projectId: input.projectId,
        summary: "Short summary of project-moving work found.",
        creates: [
          {
            kind: "project_issue",
            projectId: input.projectId,
            title: "Plain-language task title",
            summary: "Why this work is needed in 1-2 short sentences.",
            userOutcome: "What the user or project gains when complete.",
            nextAction: "Concrete next action someone can take now.",
            status: "backlog | todo | doing | done",
            statusReason: "Why this status is appropriate.",
            priority: "low | medium | high",
            priorityReason: "Why this priority is appropriate.",
            sourceEvidence: ["relative/project-file.md"],
            technicalDetails: "Internal file/function/log hints only.",
          },
        ],
        updates: [],
      },
      null,
      2,
    ),
    "Existing issues:",
    ...input.existingIssues.map((issue) => `- ${issue}`),
    "Project manifest:",
    input.projectManifest,
  ].join("\n");
}

export { buildProjectAnalysisPrompt, parseProjectAnalysisPlanJson, validateProjectAnalysisPlan };
export type {
  ProjectAnalysisPlan,
  ProjectAnalysisPlanValidationResult,
  ProjectIssueCreate,
  ProjectIssuePriority,
  ProjectIssueStatus,
  ProjectIssueUpdate,
  ProjectSourceEvidence,
};
