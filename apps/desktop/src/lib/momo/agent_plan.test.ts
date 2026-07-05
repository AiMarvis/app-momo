import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { planFailedValidationRun, validateOrganizeInboxAgentPlan } from "./agent_plan";

const VALID_PLAN = {
  summary: "Created lecture follow-up work.",
  sourceNote: "Inbox/raw.md",
  provider: { kind: "codex_cli", name: "codex" },
  creates: [
    {
      kind: "managed_task",
      title: "Send materials to Minji",
      sourceNote: "Inbox/raw.md",
      status: "todo",
      important: true,
      path: "Tasks/send-materials-to-minji.md",
    },
    {
      kind: "build_issue",
      title: "Finalize Today dashboard MVP",
      sourceNote: "Inbox/raw.md",
      status: "todo",
      priority: "high",
      project: "AI operating dashboard",
      path: "Issues/finalize-today-dashboard-mvp.md",
    },
    {
      kind: "project",
      title: "June Lecture",
      sourceNote: "Inbox/raw.md",
      projectType: "life",
      path: "Projects/june-lecture.md",
    },
    {
      kind: "schedule_block",
      title: "Draft lecture outline",
      sourceNote: "Inbox/raw.md",
      start: "2026-06-29T09:00:00+09:00",
      end: "2026-06-29T10:00:00+09:00",
      path: "Calendar/2026-06-29-draft-lecture-outline.md",
    },
    {
      kind: "planning_candidate",
      title: "Pick rehearsal date",
      sourceNote: "Inbox/raw.md",
      path: "Calendar/pick-rehearsal-date.md",
    },
    {
      kind: "note_link",
      title: "Partner meeting",
      sourceNote: "Inbox/raw.md",
      target: "Knowledge/partner-meeting.md",
      relation: "related",
    },
  ],
  updates: [
    {
      kind: "mark_inbox_processed",
      sourceNote: "Inbox/raw.md",
      organizedInto: ["Tasks/send-materials-to-minji.md", "Issues/finalize-today-dashboard-mvp.md"],
    },
  ],
  approvalRequired: [
    {
      kind: "existing_note_update",
      summary: "Changing an existing project body requires approval.",
      path: "Projects/june-lecture.md",
    },
  ],
};

describe("organize inbox agent plan", () => {
  it("validates a safe domain-level plan without applying vault changes", () => {
    const result = validateOrganizeInboxAgentPlan(VALID_PLAN);

    expect(result).toMatchObject({
      kind: "valid",
      plan: { sourceNote: "Inbox/raw.md" },
      safeChanges: [
        { kind: "create", itemKind: "managed_task", path: "Tasks/send-materials-to-minji.md" },
        { kind: "create", itemKind: "build_issue", path: "Issues/finalize-today-dashboard-mvp.md" },
        { kind: "create", itemKind: "project", path: "Projects/june-lecture.md" },
        {
          kind: "create",
          itemKind: "schedule_block",
          path: "Calendar/2026-06-29-draft-lecture-outline.md",
        },
        { kind: "create", itemKind: "planning_candidate", path: "Calendar/pick-rehearsal-date.md" },
        { kind: "link", itemKind: "note_link", path: "Knowledge/partner-meeting.md" },
        { kind: "update_source_note", path: "Inbox/raw.md" },
      ],
      approvalRequired: [
        {
          kind: "existing_note_update",
          summary: "Changing an existing project body requires approval.",
          path: "Projects/june-lecture.md",
        },
      ],
    });
  });

  it("rejects mixed source notes and unsupported enum values before mutation mapping", () => {
    const result = validateOrganizeInboxAgentPlan({
      ...VALID_PLAN,
      creates: [
        {
          kind: "managed_task",
          title: "Valid task",
          sourceNote: "Inbox/raw.md",
          status: "blocked",
          path: "Tasks/valid-task.md",
        },
        {
          kind: "build_issue",
          title: "Invalid issue",
          sourceNote: "Inbox/other.md",
          status: "todo",
          priority: "P0",
          path: "Issues/invalid-issue.md",
        },
      ],
    });

    expect(result).toEqual({
      kind: "invalid",
      errors: [
        "creates[0].status must be todo or done",
        "creates[1].sourceNote must match plan sourceNote",
        "creates[1].priority must be low, medium, or high",
      ],
    });
  });

  it("rejects natural-language-only and low-level file patch provider output", () => {
    expect(validateOrganizeInboxAgentPlan("Create a task and mark the note done.")).toEqual({
      kind: "invalid",
      errors: ["Agent Plan must be a JSON object"],
    });
    expect(
      validateOrganizeInboxAgentPlan({
        ...VALID_PLAN,
        creates: [{ kind: "file_patch", path: "Tasks/x.md", patch: "---" }],
      }),
    ).toEqual({
      kind: "invalid",
      errors: ["creates[0].kind is unsupported"],
    });
  });

  it("builds a failed run log with validation summaries only and no output writes", () => {
    const result = planFailedValidationRun({
      sourceNote: "Inbox/raw.md",
      provider: { kind: "codex_cli", name: "codex" },
      validationErrors: ["creates[0].priority must be low, medium, or high"],
    });

    expect(result.vaultChanges).toEqual([
      {
        kind: "write_failed_run_log",
        path: result.runLogPath,
      },
    ]);
    expect(result.runLogMarkdown).toContain("status: failed_validation");
    expect(result.runLogMarkdown).toContain("creates[0].priority must be low, medium, or high");
    expect(result.runLogMarkdown).not.toContain("P0");
    expect(result.runLogMarkdown).not.toContain("full model response");
    expect(result.runLogMarkdown).not.toContain("```json");
  });

  it("keeps untrusted provider field names out of failed run logs", () => {
    const secretKey = "model_response_secret_TOKEN_abc123";
    const validation = validateOrganizeInboxAgentPlan({
      ...VALID_PLAN,
      provider: {
        kind: "openai_api",
        name: "openai",
        fallbackFrom: "model_response_secret",
        [secretKey]: "raw model text must not persist",
      },
    });

    expect(validation).toEqual({
      kind: "invalid",
      errors: [
        "plan.provider has unsupported fields",
        "plan.provider.fallbackFrom must be codex_cli or openai_api",
      ],
    });
    if (validation.kind !== "invalid") return;

    const failed = planFailedValidationRun({
      sourceNote: "Inbox/raw.md",
      provider: { kind: "openai_api", name: "openai" },
      validationErrors: validation.errors,
    });
    expect(failed.runLogMarkdown).toContain("plan.provider has unsupported fields");
    expect(failed.runLogMarkdown).toContain(
      "plan.provider.fallbackFrom must be codex_cli or openai_api",
    );
    expect(failed.runLogMarkdown).not.toContain(secretKey);
    expect(failed.runLogMarkdown).not.toContain("TOKEN");
    expect(failed.runLogMarkdown).not.toContain("model_response_secret");
  });

  it("writes only a failed run log when an invalid plan is handled by the harness", async () => {
    const vaultRoot = await mkdtemp(join(tmpdir(), "momo-task-6-invalid-plan-"));
    try {
      await mkdir(join(vaultRoot, "Inbox"));
      await mkdir(join(vaultRoot, ".AgentRuns"));
      await writeFile(join(vaultRoot, "Inbox/raw.md"), "# Raw\n", "utf8");

      const validation = validateOrganizeInboxAgentPlan({
        ...VALID_PLAN,
        creates: [
          {
            kind: "build_issue",
            title: "Invalid issue",
            sourceNote: "Inbox/raw.md",
            status: "todo",
            priority: "P0",
            path: "Issues/invalid-issue.md",
          },
        ],
      });
      expect(validation.kind).toBe("invalid");
      if (validation.kind !== "invalid") return;

      const failed = planFailedValidationRun({
        sourceNote: "Inbox/raw.md",
        provider: { kind: "codex_cli", name: "codex" },
        validationErrors: validation.errors,
      });
      await writeFile(join(vaultRoot, failed.runLogPath), failed.runLogMarkdown, "utf8");

      expect(await readFile(join(vaultRoot, "Inbox/raw.md"), "utf8")).toBe("# Raw\n");
      await expect(readdir(join(vaultRoot, "Tasks"))).rejects.toThrow();
      await expect(readdir(join(vaultRoot, "Issues"))).rejects.toThrow();
      await expect(readdir(join(vaultRoot, "Projects"))).rejects.toThrow();
      expect(await readdir(join(vaultRoot, ".AgentRuns"))).toEqual(["failed-organize-inbox.md"]);
      const runLog = await readFile(join(vaultRoot, failed.runLogPath), "utf8");
      expect(runLog).toContain("status: failed_validation");
      expect(runLog).toContain("creates[0].priority must be low, medium, or high");
      expect(runLog).not.toContain("P0");
      expect(runLog).not.toContain("```json");
    } finally {
      await rm(vaultRoot, { recursive: true, force: true });
    }
  });
});
