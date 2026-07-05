import { describe, expect, it } from "vitest";

import { buildAgentReceipt, providerFallbackNote } from "./agent_receipt";
import type { AgentPlan } from "./agent_plan";

const PLAN: AgentPlan = {
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
      blocked: false,
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
      organizedInto: ["Tasks/send-materials-to-minji.md"],
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

describe("agent receipt view model", () => {
  it("leads with work outcomes and keeps paths in details", () => {
    const receipt = buildAgentReceipt({
      kind: "applied",
      plan: PLAN,
      runLogPath: ".AgentRuns/run-1.md",
      undoPlanPath: ".AgentRuns/run-1-undo.md",
    });

    expect(receipt.title).toBe("Change receipt");
    expect(receipt.sections.map((section) => section.title)).toEqual([
      "Created Tasks",
      "Created Issues",
      "Suggested Schedule",
      "New or Linked Projects",
      "Needs approval",
      "Undo",
    ]);
    expect(receipt.sections[0]?.items[0]).toMatchObject({
      title: "Send materials to Minji",
      detail: "Managed Task",
      path: "Tasks/send-materials-to-minji.md",
    });
    expect(receipt.visibleText).toContain("Send materials to Minji");
    expect(receipt.visibleText).not.toContain("Tasks/send-materials-to-minji.md");
  });

  it("shows the fallback provider note only for explicit OpenAI fallback", () => {
    expect(providerFallbackNote({ kind: "codex_cli", name: "codex" })).toBeNull();
    expect(providerFallbackNote({ kind: "openai_api", name: "openai" })).toBeNull();
    expect(
      providerFallbackNote({
        kind: "openai_api",
        name: "openai",
        fallbackFrom: "codex_cli",
        fallbackReason: "Codex CLI failed",
        fallbackApprovedAt: "2026-06-27T21:00:00.000Z",
      }),
    ).toBe("OpenAI API fallback used after approval.");
  });

  it("renders invalid-plan summaries without raw provider output", () => {
    const receipt = buildAgentReceipt({
      kind: "invalid_plan",
      sourceNote: "Inbox/raw.md",
      provider: { kind: "codex_cli", name: "codex" },
      validationErrors: ["creates[0].priority must be low, medium, or high"],
      runLogPath: ".AgentRuns/run-1.md",
    });

    expect(receipt.title).toBe("Plan needs review");
    expect(receipt.sections).toHaveLength(1);
    expect(receipt.visibleText).toContain("creates[0].priority must be low, medium, or high");
    expect(receipt.visibleText).not.toContain("```json");
    expect(receipt.visibleText).not.toMatch(/raw provider|prompt|full response|diff/i);
  });

  it("marks risky changes as held, not applied", () => {
    const receipt = buildAgentReceipt({ kind: "applied", plan: PLAN });
    const needsApproval = receipt.sections.find((section) => section.title === "Needs approval");

    expect(needsApproval?.items).toEqual([
      {
        title: "Changing an existing project body requires approval.",
        detail: "Held for approval",
        path: "Projects/june-lecture.md",
      },
    ]);
    expect(needsApproval?.items[0]?.detail).not.toMatch(/applied/i);
  });
});
