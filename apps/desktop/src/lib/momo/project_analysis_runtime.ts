import type { ProjectAnalysisPlan, ProjectIssueCreate, ProjectIssueUpdate } from "./project_analysis_plan";

type ProjectIssueCreateOperation = {
  readonly kind: "create_project_issue";
  readonly projectId: string;
  readonly issue: ProjectIssueCreate;
};

type ProjectIssueUpdateOperation = {
  readonly kind: "update_project_issue";
  readonly projectId: string;
  readonly issueId: string;
  readonly update: ProjectIssueUpdate;
};

type ProjectIssueOperation = ProjectIssueCreateOperation | ProjectIssueUpdateOperation;

type ProjectRunReceipt = {
  readonly kind: "project_run_receipt";
  readonly projectId: string;
  readonly generatedAt: string;
  readonly summary: string;
  readonly createdIssueCount: number;
  readonly updatedIssueCount: number;
  readonly sourceEvidencePaths: readonly string[];
};

type ProjectAnalysisRuntimeResult = {
  readonly operations: readonly ProjectIssueOperation[];
  readonly receipt: ProjectRunReceipt;
};

function projectAnalysisPlanToOperations(
  plan: ProjectAnalysisPlan,
  generatedAt: string,
): ProjectAnalysisRuntimeResult {
  const operations: readonly ProjectIssueOperation[] = [
    ...plan.creates.map((issue) => ({
      kind: "create_project_issue" as const,
      projectId: issue.projectId,
      issue,
    })),
    ...plan.updates.map((update) => ({
      kind: "update_project_issue" as const,
      projectId: update.projectId,
      issueId: update.issueId,
      update,
    })),
  ];

  return {
    operations,
    receipt: {
      kind: "project_run_receipt",
      projectId: plan.projectId,
      generatedAt,
      summary: plan.summary,
      createdIssueCount: plan.creates.length,
      updatedIssueCount: plan.updates.length,
      sourceEvidencePaths: sourceEvidencePaths(plan),
    },
  };
}

function sourceEvidencePaths(plan: ProjectAnalysisPlan): readonly string[] {
  const paths = new Set<string>();
  for (const create of plan.creates) {
    for (const path of create.sourceEvidence) paths.add(path);
  }
  for (const update of plan.updates) {
    for (const path of update.sourceEvidence ?? []) paths.add(path);
  }
  return [...paths];
}

export { projectAnalysisPlanToOperations };
export type {
  ProjectAnalysisRuntimeResult,
  ProjectIssueCreateOperation,
  ProjectIssueOperation,
  ProjectIssueUpdateOperation,
  ProjectRunReceipt,
};
