import { describe, expect, it } from "vitest";

import {
  parseProjectAnalysisPlanJson,
  type ProjectAnalysisPlan,
  type ProjectIssueCreate,
} from "./project_analysis_plan";

const PROJECT_ID = "project_momo_desktop";
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

describe("ProjectAnalysisPlan safety validation", () => {
  it("rejects file, function, and internal-error-only issue titles", () => {
    for (const [title, error] of [
      ["apps/desktop/src/lib/momo/project_analysis_runtime.ts", TECHNICAL_TITLE_ERROR],
      ["applyProjectIssueUpdates()", TECHNICAL_TITLE_ERROR],
      ["TypeError: Cannot read properties of undefined", TECHNICAL_TITLE_ERROR],
      ["8f3a1bc9d4e5f60718293a4b5c6d7e8f90123456", GIT_TITLE_ERROR],
      ["git diff 8f3a1bc..9a4b2cd", GIT_TITLE_ERROR],
    ] as const) {
      expect(parseProjectAnalysisPlanJson(JSON.stringify(withCreate({ title })), PROJECT_ID)).toEqual({
        kind: "invalid",
        errors: [error],
      });
    }
  });

  it("rejects developer shorthand issue titles from Git-derived changes", () => {
    for (const title of [
      "fix updater config",
      "src-tauri build error",
      "handleProjectSync refactor",
      "panic in openai_compatible.rs",
      "Update payment-recovery.md for users",
    ]) {
      expect(parseProjectAnalysisPlanJson(JSON.stringify(withCreate({ title })), PROJECT_ID)).toEqual({
        kind: "invalid",
        errors: [TECHNICAL_TITLE_ERROR],
      });
    }
    expect(
      parseProjectAnalysisPlanJson(
        JSON.stringify(withCreate({ title: "Help users verify abcdef1 before release" })),
        PROJECT_ID,
      ),
    ).toEqual({ kind: "invalid", errors: [GIT_TITLE_ERROR] });
  });

  it("rejects over-technical user-facing fields", () => {
    const plan = withCreate({
      summary: "ProjectList.tsx throws TypeError inside renderProjectIssueCard().",
      userOutcome: "Users avoid a TypeError in the dashboard component.",
      nextAction: "Patch renderProjectIssueCard() in apps/desktop/src/lib/momo/project_analysis.ts.",
    });

    expect(parseProjectAnalysisPlanJson(JSON.stringify(plan), PROJECT_ID)).toEqual({
      kind: "invalid",
      errors: [
        "creates[0].summary must be written for a project user, not as technical diagnostics",
        "creates[0].userOutcome must be written for a project user, not as technical diagnostics",
        "creates[0].nextAction must be written for a project user, not as technical diagnostics",
      ],
    });
  });

  it("rejects overly abstract and non-actionable issues", () => {
    const plan = withCreate({ title: "Improve the whole project", nextAction: "Look into it later" });

    expect(parseProjectAnalysisPlanJson(JSON.stringify(plan), PROJECT_ID)).toEqual({
      kind: "invalid",
      errors: [
        "creates[0].title must name a concrete project issue",
        "creates[0].nextAction must be a concrete next action",
      ],
    });
  });

  it("allows concrete improvement titles and branded product names", () => {
    expect(
      parseProjectAnalysisPlanJson(
        JSON.stringify(
          withCreate({
            title: "Improve checkout recovery guidance after failed payments",
            summary: "Customers need clearer recovery guidance when a payment attempt does not finish.",
            userOutcome: "Customers can recover the purchase without guessing what happened.",
            nextAction: "Draft the first recovery message and assign the owner who will approve it.",
          }),
        ),
        PROJECT_ID,
      ).kind,
    ).toBe("valid");
    for (const title of [
      "Help OpenAI workspace admins confirm billing access",
      "Make GitHub import progress clear for team owners",
    ]) {
      expect(parseProjectAnalysisPlanJson(JSON.stringify(withCreate({ title })), PROJECT_ID).kind).toBe("valid");
    }
  });

  it("rejects wrapped second-brain source evidence paths", () => {
    const sourceEvidence = [
      "/Inbox/raw.md",
      "Inbox/raw.md",
      "Knowledge/project.md",
      "Organize Inbox/run.md",
      "`Knowledge/project.md`",
      "[Knowledge/project.md]",
      "Source:Knowledge/project.md",
    ];

    expect(parseProjectAnalysisPlanJson(JSON.stringify(withCreate({ sourceEvidence })), PROJECT_ID)).toEqual({
      kind: "invalid",
      errors: sourceEvidence.map((_, index) => `creates[0].sourceEvidence[${index}] must not reference second-brain paths`),
    });
  });

  it("rejects unsafe source evidence paths", () => {
    const sourceEvidence = [
      "../package.json",
      "/etc/passwd",
      "src/bad\u0000name.ts",
      "docs/link -> /etc/passwd",
      "~/secrets.md",
      "~user/secrets.md",
    ];

    expect(parseProjectAnalysisPlanJson(JSON.stringify(withCreate({ sourceEvidence })), PROJECT_ID)).toEqual({
      kind: "invalid",
      errors: sourceEvidence.map((_, index) => `creates[0].sourceEvidence[${index}] must be a safe project-relative path`),
    });
  });

  it("rejects wrapped second-brain references in plan text", () => {
    const plan = {
      ...withCreate({
        nextAction: "Ask the owner to summarize [Knowledge/project.md] inside the launch note.",
        technicalDetails: "Source note came from `Knowledge/project.md` and Source:Knowledge/project.md.",
      }),
      summary: "Review notes reference Source:Knowledge/project.md.",
    };

    expect(parseProjectAnalysisPlanJson(JSON.stringify(plan), PROJECT_ID)).toEqual({
      kind: "invalid",
      errors: [
        "plan.summary must not reference second-brain paths",
        "creates[0].nextAction must not reference second-brain paths",
        "creates[0].technicalDetails must not reference second-brain paths",
      ],
    });
  });

  it("rejects Git write intent and second-brain references in plan text", () => {
    const plan = {
      ...withCreate({
        nextAction: "Run git reset --hard and then share the release notes.",
        technicalDetails: "Source note came from Knowledge/project.md.",
      }),
      summary: "Run git commit for the dashboard work.",
    };

    expect(parseProjectAnalysisPlanJson(JSON.stringify(plan), PROJECT_ID)).toEqual({
      kind: "invalid",
      errors: [
        "plan.summary must not request Git write actions",
        "creates[0].nextAction must not request Git write actions",
        "creates[0].technicalDetails must not reference second-brain paths",
      ],
    });
  });

  it("rejects Git write intent in source evidence", () => {
    const sourceEvidence = ["docs/launch-review.md", "git reset --hard", "git -C /tmp/project stash"];

    expect(parseProjectAnalysisPlanJson(JSON.stringify(withCreate({ sourceEvidence })), PROJECT_ID)).toEqual({
      kind: "invalid",
      errors: [
        "creates[0].sourceEvidence[1] must be a safe project-relative path",
        "creates[0].sourceEvidence[2] must be a safe project-relative path",
      ],
    });
  });

  it("rejects Git write intent after Git global options and trailing punctuation", () => {
    const plan = {
      ...withCreate({
        nextAction: "Ask the release owner to review the update path.",
        technicalDetails: "Do not run git --work-tree=/tmp/project clean -fd or git --git-dir=/tmp/repo tag. from Project OS.",
      }),
      summary: "Do not run git -C /tmp/project reset., git -c core.hooksPath=/tmp commit -m x, or git --git-dir=/tmp/repo tag v1.",
    };

    expect(parseProjectAnalysisPlanJson(JSON.stringify(plan), PROJECT_ID)).toEqual({
      kind: "invalid",
      errors: [
        "plan.summary must not request Git write actions",
        "creates[0].technicalDetails must not request Git write actions",
      ],
    });
  });

  it("rejects broader Git write intent in plan text", () => {
    for (const command of ["switch", "restore", "push --force", "merge", "rebase", "stash"]) {
      expect(
        parseProjectAnalysisPlanJson(
          JSON.stringify({
            ...withCreate({ nextAction: "Ask the release owner to review the update path." }),
            summary: `Do not run git ${command} from Project OS.`,
          }),
          PROJECT_ID,
        ),
      ).toEqual({
        kind: "invalid",
        errors: ["plan.summary must not request Git write actions"],
      });
    }
  });

  it("rejects Git metadata/config write intent in plan text", () => {
    for (const command of ["config", "init", "notes", "replace", "update-index", "update-ref", "symbolic-ref"]) {
      expect(
        parseProjectAnalysisPlanJson(
          JSON.stringify({
            ...withCreate({ nextAction: "Ask the release owner to review the update path." }),
            summary: `Do not run git ${command} from Project OS.`,
          }),
          PROJECT_ID,
        ),
      ).toEqual({
        kind: "invalid",
        errors: ["plan.summary must not request Git write actions"],
      });
    }
  });
});

function validPlan(): ProjectAnalysisPlan {
  return {
    kind: "project_analysis",
    projectId: PROJECT_ID,
    summary: "Launch review work needs clearer ownership.",
    creates: [VALID_CREATE],
    updates: [],
  };
}

function withCreate(create: Partial<ProjectIssueCreate>): ProjectAnalysisPlan {
  return { ...validPlan(), creates: [{ ...VALID_CREATE, ...create }] };
}

const TECHNICAL_TITLE_ERROR = "creates[0].title must describe user-visible work, not a file/function/error";
const GIT_TITLE_ERROR = "creates[0].title must describe user-visible work, not Git metadata";
