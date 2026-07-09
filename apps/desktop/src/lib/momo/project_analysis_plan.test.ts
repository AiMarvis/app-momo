import { describe, expect, it } from "vitest";

import {
  buildProjectAnalysisPrompt,
  parseProjectAnalysisPlanJson,
  projectAnalysisPlanLanguageErrors,
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
        commitsByDate: [
          {
            date: "2026-07-06",
            commits: [
              {
                shortHash: "aaaaaaa",
                subject: "prepare release",
                author: "Momo",
                authorDate: "2026-07-06T09:00:00+09:00",
                changedPaths: ["docs/release.md"],
                diffStat: [{ path: "docs/release.md", additions: 1, deletions: 1 }],
              },
            ],
          },
        ],
        workingTree: {
          stagedPaths: [],
          unstagedPaths: ["docs/release.md"],
          untrackedPaths: [],
        },
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
        commitsByDate: [
          { date: "2026-07-05", commits: [] },
          {
            date: "2026-07-06",
            commits: [
              {
                shortHash: "aaaaaaa",
                subject: "release checklist",
                author: "Momo",
                authorDate: "2026-07-06T09:00:00+09:00",
                changedPaths: ["src/release.ts", "docs/release.md"],
                diffStat: [
                  { path: "src/release.ts", additions: 3, deletions: 0 },
                  { path: "docs/release.md", additions: 1, deletions: 1 },
                ],
              },
            ],
          },
        ],
        workingTree: {
          stagedPaths: ["src/release.ts"],
          unstagedPaths: ["docs/release.md"],
          untrackedPaths: [],
        },
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
    expect(prompt).toContain("Use every commitsByDate entry");
    expect(prompt).toContain('"status": "doing"');
  });

  it("rejects backlog statuses from LLM ProjectAnalysisPlan output", () => {
    const result = parseProjectAnalysisPlanJson(
      JSON.stringify({
        ...validPlan(),
        creates: [{ ...VALID_CREATE, status: "backlog" }],
      }),
      PROJECT_ID,
    );

    expect(result).toEqual({
      kind: "invalid",
      errors: ["creates[0].status must be todo, doing, or done"],
    });
  });

  it("reports non-Korean user-facing strings after JSON validation when Korean is selected", () => {
    const englishResult = parseProjectAnalysisPlanJson(JSON.stringify(validPlan()), PROJECT_ID);
    expect(englishResult.kind).toBe("valid");
    if (englishResult.kind !== "valid") return;

    expect(projectAnalysisPlanLanguageErrors(englishResult.plan, "ko")).toEqual(
      expect.arrayContaining([
        "plan.summary must be Korean when Project Issue language is Korean",
        "creates[0].title must be Korean when Project Issue language is Korean",
      ]),
    );

    const koreanResult = parseProjectAnalysisPlanJson(
      JSON.stringify({
        kind: "project_analysis",
        projectId: PROJECT_ID,
        summary: "릴리즈 준비 상태를 짧게 확인해야 합니다.",
        creates: [
          {
            kind: "project_issue",
            projectId: PROJECT_ID,
            title: "릴리즈 전 확인 항목 정리",
            summary: "배포 전에 확인할 항목이 한곳에 보여야 합니다.",
            userOutcome: "팀이 남은 확인 항목을 빠르게 이해합니다.",
            nextAction: "다음 회의 전에 확인 항목과 담당자를 적습니다.",
            status: "todo",
            statusReason: "아직 확인 항목 정리가 남아 있습니다.",
            priority: "high",
            priorityReason: "배포 전 합의에 바로 필요합니다.",
            sourceEvidence: ["docs/release.md"],
            technicalDetails: "Git 메타데이터에서 릴리즈 문서 변경이 확인되었습니다.",
          },
        ],
        updates: [],
      }),
      PROJECT_ID,
    );
    expect(koreanResult.kind).toBe("valid");
    if (koreanResult.kind !== "valid") return;
    expect(projectAnalysisPlanLanguageErrors(koreanResult.plan, "ko")).toEqual([]);
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
