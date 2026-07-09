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

  it("builds Project OS agent input with manifest, Git summary, existing issues, and last receipt", () => {
    const prompt = buildProjectAnalysisPrompt({
      projectId: PROJECT_ID,
      projectName: "Momo Desktop",
      issueLanguage: "en",
      nowIso: "2026-07-07T00:00:00.000Z",
      manifest: {
        rootName: "momo",
        files: [
          {
            path: "docs/release.md",
            size: 42,
            snippet: "Release owner and update checklist",
          },
        ],
        skipped: [],
        limits: { maxFiles: 200, maxBytes: 524288, bytesRead: 42, truncated: false },
      },
      gitSummary: {
        status: "ready",
        head: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        previousCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        range: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb..HEAD",
        changedPaths: ["docs/release.md"],
        statusShort: [" M docs/release.md"],
        diffNameStatus: ["M\tdocs/release.md"],
        diffStat: ["docs/release.md | 2 +-"],
        logOneline: ["aaaaaaaa prepare release"],
        message: null,
      },
      existingIssues: ["id=issue_existing; title=Confirm who owns launch review; status=todo"],
      lastRunReceipt: {
        status: "applied",
        summary: "Found 1 project-moving task from the linked folder.",
        finishedAt: "2026-07-06T00:00:00.000Z",
        git: {
          status: "summarized",
          headCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          range: "v0.5.0..HEAD",
          summary: "Included 3 changed paths and 1 recent commit.",
        },
      },
    });

    expect(prompt).toContain("ProjectAnalysisPlan");
    expect(prompt).toContain('"manifest"');
    expect(prompt).toContain("docs/release.md");
    expect(prompt).toContain('"gitChangeSummary"');
    expect(prompt).toContain("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb..HEAD");
    expect(prompt).toContain('"existingProjectOsIssues"');
    expect(prompt).toContain("Confirm who owns launch review");
    expect(prompt).toContain('"lastRunReceipt"');
    expect(prompt).toContain("Found 1 project-moving task from the linked folder.");
    expect(prompt).toContain(
      "Top-level JSON object must include kind, projectId, summary, creates, and updates.",
    );
    expect(prompt).toContain('"topLevelRequiredFields"');
    expect(prompt).toContain('"creates": [');
    expect(prompt).toContain('"updates": [');
    expect(prompt).not.toContain("Organize Inbox");
  });

  it("adds the selected Project Issue language and concise Git metadata rules to the prompt", () => {
    const prompt = buildProjectAnalysisPrompt({
      projectId: PROJECT_ID,
      projectName: "Momo Desktop",
      issueLanguage: "ko",
      nowIso: "2026-07-07T00:00:00.000Z",
      manifest: {
        rootName: "momo",
        files: [{ path: "src/release.ts", size: 33, snippet: "export const ready = true;" }],
        skipped: [],
        limits: { maxFiles: 200, maxBytes: 524288, bytesRead: 33, truncated: false },
      },
      gitSummary: {
        status: "ready",
        head: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        previousCommit: null,
        range: "HEAD",
        changedPaths: ["src/release.ts", "docs/release.md"],
        statusShort: [],
        diffNameStatus: [],
        diffStat: [],
        logOneline: ["aaaaaaaa release checklist"],
        message: null,
      },
      existingIssues: ["No existing Project OS issues."],
      lastRunReceipt: null,
    });

    expect(prompt).toContain('"issueLanguage"');
    expect(prompt).toContain('"code": "ko"');
    expect(prompt).toContain("Korean (한국어)");
    expect(prompt).toContain("Write all user-facing ProjectAnalysisPlan strings in Korean");
    expect(prompt).toContain("sourceEvidence paths must stay unchanged");
    expect(prompt).toContain("Use Git metadata as the primary signal");
    expect(prompt).toContain("Keep every user-facing field very short");
    expect(prompt).toContain("Prefer one concise issue");
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
