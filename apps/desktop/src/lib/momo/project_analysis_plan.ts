import type { ProjectGitSummary, ProjectOsManifest } from "../project_os_fs";
import { validateProjectAnalysisPlan } from "./project_analysis_plan_validation";

type ProjectIssueStatus = "doing" | "done" | "todo";
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

type ProjectIssueOutputLanguage = "en" | "ja" | "ko";

type ProjectAnalysisPromptInput = {
  readonly projectId: string;
  readonly projectName: string;
  readonly issueLanguage: ProjectIssueOutputLanguage;
  readonly manifest: ProjectOsManifest;
  readonly gitSummary: ProjectGitSummary;
  readonly existingIssues: readonly string[];
  readonly lastRunReceipt: ProjectAnalysisLastRunReceipt | null;
  readonly nowIso: string;
};

function buildProjectAnalysisPrompt(input: ProjectAnalysisPromptInput): string {
  const language = projectIssueLanguage(input.issueLanguage);
  const payload = {
    project: {
      id: input.projectId,
      name: input.projectName,
      generatedAt: input.nowIso,
    },
    issueLanguage: {
      code: input.issueLanguage,
      label: language.label,
      rule: language.rule,
    },
    manifest: input.manifest,
    gitChangeSummary: input.gitSummary,
    existingProjectOsIssues: input.existingIssues,
    lastRunReceipt: input.lastRunReceipt,
    evidenceCoverage: {
      boundedEvidenceRule:
        "Use only this bounded manifest and Git metadata summary. Do not ask the model to inspect files or Git directly.",
      gitMetadataRule:
        "Use Git metadata as the primary signal: commitsByDate, commit subjects, short hashes, authors/dates, changed paths, additions/deletions, and current staged/unstaged/untracked paths. Do not infer detailed implementation behavior from source code.",
      scheduleRangeRule:
        "Use every commitsByDate entry in the schedule date range, including dates with no commits, before deciding whether work is todo, doing, or done.",
      distinctWorkRule:
        "Create or update the clearest owner-facing work items. Separate todo, doing, and done only when the schedule-range Git metadata shows distinct project moves.",
    },
    outputContract: {
      kind: "project_analysis",
      topLevelRequiredFields: ["kind", "projectId", "summary", "creates", "updates"],
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
      jsonOnlyRule:
        'Return the ProjectAnalysisPlan object itself. Do not wrap it in {"plan": ...}, Markdown fences, or explanatory prose.',
      placeholderRule: "Replace outputShape placeholder strings with evidence-specific values.",
      emptyResultRule:
        "If no safe project issue should be created or updated, return creates: [] and updates: [] with a short summary.",
      languageRule: language.rule,
      titleRule:
        "Use one short non-developer title. Keep filenames, functions, and commit hashes out of titles.",
      conciseCopyRule:
        "Keep every user-facing field very short: title under 70 characters, summary and nextAction one sentence each, technicalDetails under 180 characters.",
      statusRule:
        "Use only todo, doing, or done. todo is work still needed, doing is work partly underway, and done is work Git metadata shows as already completed.",
      scopeRule:
        "Use only the linked project evidence in this payload and return Project OS issue operations only.",
      createCountRule:
        "The outputShape shows multiple statuses. Return only evidence-backed issues, but do not collapse separate schedule-date work into one vague issue.",
      outputShape: {
        kind: "project_analysis",
        projectId: input.projectId,
        summary: "One sentence describing what project-moving work was found.",
        creates: [
          {
            kind: "project_issue",
            projectId: input.projectId,
            title: "Owner-readable todo title",
            summary: "Plain-language gist of the remaining work.",
            userOutcome: "The user-visible outcome this work enables.",
            nextAction: "The next simple check a project owner can take.",
            status: "todo",
            statusReason: "Why this status fits the evidence.",
            priority: "medium",
            priorityReason: "Why this priority fits the evidence.",
            sourceEvidence: ["relative/path/from/provided/evidence"],
            technicalDetails: "Brief metadata-based context grounded in the evidence.",
          },
          {
            kind: "project_issue",
            projectId: input.projectId,
            title: "Owner-readable in-progress title",
            summary: "Plain-language gist of partly completed work.",
            userOutcome: "The user-visible outcome this work enables.",
            nextAction: "The next simple verification step.",
            status: "doing",
            statusReason: "Why current Git metadata shows partial progress.",
            priority: "medium",
            priorityReason: "Why this priority fits the evidence.",
            sourceEvidence: ["relative/path/from/provided/evidence"],
            technicalDetails: "Brief metadata-based context grounded in the evidence.",
          },
          {
            kind: "project_issue",
            projectId: input.projectId,
            title: "Owner-readable completed title",
            summary: "Plain-language gist of completed work.",
            userOutcome: "The user-visible outcome this work enables.",
            nextAction: "The next simple confirmation step.",
            status: "done",
            statusReason: "Why Git history shows this work is complete.",
            priority: "medium",
            priorityReason: "Why this priority fits the evidence.",
            sourceEvidence: ["relative/path/from/provided/evidence"],
            technicalDetails: "Brief metadata-based context grounded in the evidence.",
          },
        ],
        updates: [
          {
            kind: "project_issue_update",
            projectId: input.projectId,
            issueId: "existing_issue_id_from_existingProjectOsIssues",
            summary: "Optional updated summary.",
            status: "doing",
            statusReason: "Why this status changed.",
            priority: "medium",
            priorityReason: "Why this priority changed.",
            sourceEvidence: ["relative/path/from/provided/evidence"],
            technicalDetails: "Brief update context grounded in the evidence.",
          },
        ],
      },
    },
  };
  return [
    "You are Project OS analysis. Return only a JSON ProjectAnalysisPlan.",
    "Top-level JSON object must include kind, projectId, summary, creates, and updates.",
    language.rule,
    "JSON property names, status enum values, priority enum values, projectId, issueId, and sourceEvidence paths must stay unchanged and must not be translated.",
    "Use Git metadata as the primary signal and explain the likely project work in plain non-developer language.",
    "Use every commitsByDate entry in the schedule date range and classify issues as todo, doing, or done.",
    "Keep titles and issue text very short. Create separate issues only when metadata clearly shows separate work.",
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

function projectAnalysisPlanLanguageErrors(
  plan: ProjectAnalysisPlan,
  language: ProjectIssueOutputLanguage,
): readonly string[] {
  if (language !== "ko") return [];
  const errors: string[] = [];
  requireKorean(plan.summary, "plan.summary", errors);
  plan.creates.forEach((issue, index) => {
    requireKorean(issue.title, `creates[${index}].title`, errors);
    requireKorean(issue.summary, `creates[${index}].summary`, errors);
    requireKorean(issue.userOutcome, `creates[${index}].userOutcome`, errors);
    requireKorean(issue.nextAction, `creates[${index}].nextAction`, errors);
    requireKorean(issue.statusReason, `creates[${index}].statusReason`, errors);
    requireKorean(issue.priorityReason, `creates[${index}].priorityReason`, errors);
    requireKorean(issue.technicalDetails, `creates[${index}].technicalDetails`, errors);
  });
  plan.updates.forEach((update, index) => {
    for (const [key, value] of Object.entries(update)) {
      if (
        key === "summary" ||
        key === "userOutcome" ||
        key === "nextAction" ||
        key === "statusReason" ||
        key === "priorityReason" ||
        key === "technicalDetails"
      ) {
        requireKorean(value, `updates[${index}].${key}`, errors);
      }
    }
  });
  return errors;
}

function requireKorean(value: unknown, label: string, errors: string[]): void {
  if (typeof value === "string" && !/[가-힣]/.test(value)) {
    errors.push(`${label} must be Korean when Project Issue language is Korean`);
  }
}

function projectIssueLanguage(language: ProjectIssueOutputLanguage): {
  readonly label: string;
  readonly rule: string;
} {
  switch (language) {
    case "ko":
      return {
        label: "Korean (한국어)",
        rule: "Write all user-facing ProjectAnalysisPlan strings in Korean (한국어): summary, creates[].title, creates[].summary, creates[].userOutcome, creates[].nextAction, creates[].statusReason, creates[].priorityReason, creates[].technicalDetails, and any update text fields.",
      };
    case "ja":
      return {
        label: "Japanese (日本語)",
        rule: "Write all user-facing ProjectAnalysisPlan strings in Japanese (日本語): summary, creates[].title, creates[].summary, creates[].userOutcome, creates[].nextAction, creates[].statusReason, creates[].priorityReason, creates[].technicalDetails, and any update text fields.",
      };
    case "en":
      return {
        label: "English",
        rule: "Write all user-facing ProjectAnalysisPlan strings in English: summary, creates[].title, creates[].summary, creates[].userOutcome, creates[].nextAction, creates[].statusReason, creates[].priorityReason, creates[].technicalDetails, and any update text fields.",
      };
  }
}

export {
  buildProjectAnalysisPrompt,
  parseProjectAnalysisPlanJson,
  projectAnalysisPlanLanguageErrors,
  validateProjectAnalysisPlan,
};
export type {
  ProjectAnalysisLastRunReceipt,
  ProjectAnalysisPlan,
  ProjectAnalysisPlanValidationResult,
  ProjectAnalysisPromptInput,
  ProjectIssueOutputLanguage,
  ProjectIssueCreate,
  ProjectIssuePriority,
  ProjectIssueStatus,
  ProjectIssueUpdate,
  ProjectSourceEvidence,
};
