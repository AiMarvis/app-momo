import { describe, expect, it } from "vitest";

import type { ProjectAnalysisPlan, ProjectIssueCreate, ProjectIssueUpdate } from "./project_analysis_plan";
import { projectAnalysisPlanToOperations } from "./project_analysis_runtime";

const PROJECT_ID = "project_momo_desktop";
const NOW = "2026-07-04T00:00:00.000Z";

const ISSUE_CREATE = {
  kind: "project_issue",
  projectId: PROJECT_ID,
  title: "Clarify onboarding checklist for launch review",
  summary: "The launch checklist is split across notes, so reviewers miss the next decision.",
  userOutcome: "Reviewers can see what to approve before the launch meeting.",
  nextAction: "Add one launch checklist section with owner and due date.",
  status: "todo",
  statusReason: "The work is identified but has not started.",
  priority: "high",
  priorityReason: "The launch review is blocked until this is clear.",
  sourceEvidence: ["docs/launch-review.md"],
  technicalDetails: "Move checklist copy into the project issue body.",
} satisfies ProjectIssueCreate;

const ISSUE_UPDATE = {
  kind: "project_issue_update",
  projectId: PROJECT_ID,
  issueId: "issue_existing_launch",
  status: "doing",
  statusReason: "The launch owner started collecting review notes.",
  priority: "medium",
  priorityReason: "The blocking launch checklist is tracked separately.",
  sourceEvidence: ["docs/review-notes.md"],
  technicalDetails: "Update status and priority only.",
} satisfies ProjectIssueUpdate;

describe("ProjectAnalysisPlan runtime", () => {
  it("converts a validated plan into project-scoped create/update operations and receipt", () => {
    const result = projectAnalysisPlanToOperations(validPlan(), NOW);

    expect(result.operations).toEqual([
      {
        kind: "create_project_issue",
        projectId: PROJECT_ID,
        issue: ISSUE_CREATE,
      },
      {
        kind: "update_project_issue",
        projectId: PROJECT_ID,
        issueId: ISSUE_UPDATE.issueId,
        update: ISSUE_UPDATE,
      },
    ]);
    expect(result.receipt).toEqual({
      kind: "project_run_receipt",
      projectId: PROJECT_ID,
      generatedAt: NOW,
      summary: "Launch review work needs clearer ownership.",
      createdIssueCount: 1,
      updatedIssueCount: 1,
      sourceEvidencePaths: ["docs/launch-review.md", "docs/review-notes.md"],
    });
  });

  it("emits only Project OS operations with no second-brain paths", () => {
    const result = projectAnalysisPlanToOperations(validPlan(), NOW);
    const serialized = JSON.stringify(result);

    expect(result.operations.map((operation) => operation.projectId)).toEqual([PROJECT_ID, PROJECT_ID]);
    expect(serialized).not.toContain("Inbox");
    expect(serialized).not.toContain("Knowledge");
    expect(serialized).not.toContain("Organize Inbox");
    expect(serialized).not.toContain(".AgentRuns");
  });
});

function validPlan(): ProjectAnalysisPlan {
  return {
    kind: "project_analysis",
    projectId: PROJECT_ID,
    summary: "Launch review work needs clearer ownership.",
    creates: [ISSUE_CREATE],
    updates: [ISSUE_UPDATE],
  };
}
