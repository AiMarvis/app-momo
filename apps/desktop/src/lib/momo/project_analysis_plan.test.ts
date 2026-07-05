import { describe, expect, it } from "vitest";

import {
  buildProjectAnalysisPrompt,
  parseProjectAnalysisPlanJson,
  type ProjectAnalysisPlan,
  type ProjectIssueCreate,
  type ProjectIssueUpdate,
} from "./project_analysis_plan";

const PROJECT_ID = "project_momo_desktop";
const OTHER_PROJECT_ID = "project_other";
const NOW = "2026-07-04T00:00:00.000Z";

const VALID_CREATE = {
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
  technicalDetails: "Consolidate the existing checklist text without changing app state.",
} satisfies ProjectIssueCreate;

const VALID_UPDATE = {
  kind: "project_issue_update",
  projectId: PROJECT_ID,
  issueId: "issue_existing_launch",
  status: "doing",
  statusReason: "The launch owner started collecting review notes.",
  priority: "medium",
  priorityReason: "The blocking launch checklist is now tracked separately.",
  sourceEvidence: ["docs/review-notes.md"],
  technicalDetails: "Keep the existing issue and update only its status and priority.",
} satisfies ProjectIssueUpdate;

describe("ProjectAnalysisPlan boundary", () => {
  it("accepts project-scoped issue creates and updates from JSON", () => {
    const result = parseProjectAnalysisPlanJson(JSON.stringify(validPlan()), PROJECT_ID);

    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") return;
    expect(result.plan).toMatchObject({
      kind: "project_analysis",
      projectId: PROJECT_ID,
      creates: [{ kind: "project_issue", title: VALID_CREATE.title }],
      updates: [{ kind: "project_issue_update", issueId: VALID_UPDATE.issueId }],
    });
  });

  it("rejects malformed JSON before a plan can be applied", () => {
    expect(parseProjectAnalysisPlanJson("{ not json", PROJECT_ID)).toEqual({
      kind: "invalid",
      errors: ["ProjectAnalysisPlan must be valid JSON"],
    });
  });

  it("rejects empty required user-facing issue fields", () => {
    const plan = {
      ...validPlan(),
      creates: [
        {
          ...VALID_CREATE,
          title: "",
          summary: " ",
          userOutcome: "",
          nextAction: " ",
        },
      ],
    };

    const result = parseProjectAnalysisPlanJson(JSON.stringify(plan), PROJECT_ID);

    expect(result).toEqual({
      kind: "invalid",
      errors: [
        "creates[0].title must be a non-empty string",
        "creates[0].summary must be a non-empty string",
        "creates[0].userOutcome must be a non-empty string",
        "creates[0].nextAction must be a non-empty string",
      ],
    });
  });

  it("rejects file, function, and internal-error-only issue titles", () => {
    const pathTitle = withCreate({ title: "apps/desktop/src/lib/momo/project_analysis_runtime.ts" });
    const functionTitle = withCreate({ title: "applyProjectIssueUpdates()" });
    const errorTitle = withCreate({ title: "TypeError: Cannot read properties of undefined" });

    expect(parseProjectAnalysisPlanJson(JSON.stringify(pathTitle), PROJECT_ID)).toEqual({
      kind: "invalid",
      errors: ["creates[0].title must describe user-visible work, not a file/function/error"],
    });
    expect(parseProjectAnalysisPlanJson(JSON.stringify(functionTitle), PROJECT_ID)).toEqual({
      kind: "invalid",
      errors: ["creates[0].title must describe user-visible work, not a file/function/error"],
    });
    expect(parseProjectAnalysisPlanJson(JSON.stringify(errorTitle), PROJECT_ID)).toEqual({
      kind: "invalid",
      errors: ["creates[0].title must describe user-visible work, not a file/function/error"],
    });
  });

  it("rejects over-technical user-facing fields", () => {
    const plan = withCreate({
      summary: "ProjectList.tsx throws TypeError inside renderProjectIssueCard().",
      userOutcome: "Users avoid a TypeError in the dashboard component.",
      nextAction: "Patch renderProjectIssueCard() in apps/desktop/src/lib/momo/project_analysis.ts.",
    });

    const result = parseProjectAnalysisPlanJson(JSON.stringify(plan), PROJECT_ID);

    expect(result).toEqual({
      kind: "invalid",
      errors: [
        "creates[0].summary must be written for a project user, not as technical diagnostics",
        "creates[0].userOutcome must be written for a project user, not as technical diagnostics",
        "creates[0].nextAction must be written for a project user, not as technical diagnostics",
      ],
    });
  });

  it("rejects overly abstract and non-actionable issues", () => {
    const plan = withCreate({
      title: "Improve the whole project",
      nextAction: "Look into it later",
    });

    const result = parseProjectAnalysisPlanJson(JSON.stringify(plan), PROJECT_ID);

    expect(result).toEqual({
      kind: "invalid",
      errors: [
        "creates[0].title must name a concrete project issue",
        "creates[0].nextAction must be a concrete next action",
      ],
    });
  });

  it("allows improvement titles when the work target and next action are concrete", () => {
    const plan = withCreate({
      title: "Improve checkout recovery guidance after failed payments",
      summary: "Customers need clearer recovery guidance when a payment attempt does not finish.",
      userOutcome: "Customers can recover the purchase without guessing what happened.",
      nextAction: "Draft the first recovery message and assign the owner who will approve it.",
    });

    expect(parseProjectAnalysisPlanJson(JSON.stringify(plan), PROJECT_ID).kind).toBe("valid");
  });

  it("rejects second-brain source evidence paths", () => {
    const plan = withCreate({
      sourceEvidence: [
        "Inbox/raw.md",
        "Knowledge/project.md",
        "Organize Inbox/run.md",
      ],
    });

    const result = parseProjectAnalysisPlanJson(JSON.stringify(plan), PROJECT_ID);

    expect(result).toEqual({
      kind: "invalid",
      errors: [
        "creates[0].sourceEvidence[0] must not reference second-brain paths",
        "creates[0].sourceEvidence[1] must not reference second-brain paths",
        "creates[0].sourceEvidence[2] must not reference second-brain paths",
      ],
    });
  });

  it("rejects projectId mismatches across the plan, creates, and updates", () => {
    const plan = {
      ...validPlan(),
      projectId: OTHER_PROJECT_ID,
      creates: [{ ...VALID_CREATE, projectId: OTHER_PROJECT_ID }],
      updates: [{ ...VALID_UPDATE, projectId: OTHER_PROJECT_ID }],
    };

    const result = parseProjectAnalysisPlanJson(JSON.stringify(plan), PROJECT_ID);

    expect(result).toEqual({
      kind: "invalid",
      errors: [
        "plan.projectId must match requested projectId",
        "creates[0].projectId must match requested projectId",
        "updates[0].projectId must match requested projectId",
      ],
    });
  });

  it("rejects unsafe source evidence paths", () => {
    const plan = withCreate({
      sourceEvidence: [
        "../package.json",
        "/etc/passwd",
        "src/bad\u0000name.ts",
        "docs/link -> /etc/passwd",
      ],
    });

    const result = parseProjectAnalysisPlanJson(JSON.stringify(plan), PROJECT_ID);

    expect(result).toEqual({
      kind: "invalid",
      errors: [
        "creates[0].sourceEvidence[0] must be a safe project-relative path",
        "creates[0].sourceEvidence[1] must be a safe project-relative path",
        "creates[0].sourceEvidence[2] must be a safe project-relative path",
        "creates[0].sourceEvidence[3] must be a safe project-relative path",
      ],
    });
  });

  it("builds a Project OS prompt separate from Organize Inbox", () => {
    const prompt = buildProjectAnalysisPrompt({
      projectId: PROJECT_ID,
      projectName: "Momo Desktop",
      issueLanguage: "Korean",
      projectManifest: "docs/launch-review.md\nsrc/dashboard.tsx",
      existingIssues: ["Clarify launch owner"],
      nowIso: NOW,
    });

    expect(prompt).toContain("ProjectAnalysisPlan JSON");
    expect(prompt).toContain(PROJECT_ID);
    expect(prompt).toContain("Write all user-facing issue fields in Korean.");
    expect(prompt).toContain("Clarify launch owner");
    expect(prompt).not.toContain("Organize Inbox");
  });
});

function validPlan(): ProjectAnalysisPlan {
  return {
    kind: "project_analysis",
    projectId: PROJECT_ID,
    summary: "Launch review work needs clearer ownership.",
    creates: [VALID_CREATE],
    updates: [VALID_UPDATE],
  };
}

function withCreate(create: Partial<ProjectIssueCreate>): ProjectAnalysisPlan {
  return {
    ...validPlan(),
    creates: [{ ...VALID_CREATE, ...create }],
  };
}
