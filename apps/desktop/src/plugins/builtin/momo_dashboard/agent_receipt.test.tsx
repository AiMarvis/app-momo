import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";

import { buildAgentReceipt } from "~/lib/momo/agent_receipt";
import type { AgentPlan } from "~/lib/momo/agent_plan";

import { AgentReceiptCard } from "./agent_receipt";

const PLAN: AgentPlan = {
  summary: "Created lecture follow-up work.",
  sourceNote: "Inbox/raw.md",
  provider: {
    kind: "openai_api",
    name: "openai",
    fallbackFrom: "codex_cli",
    fallbackReason: "Codex CLI failed",
    fallbackApprovedAt: "2026-06-27T21:00:00.000Z",
  },
  creates: [
    {
      kind: "managed_task",
      title: "Send materials to Minji",
      sourceNote: "Inbox/raw.md",
      status: "todo",
      important: false,
      path: "Tasks/send-materials-to-minji.md",
    },
  ],
  updates: [],
  approvalRequired: [
    {
      kind: "existing_note_update",
      summary: "Changing an existing project body requires approval.",
      path: "Projects/june-lecture.md",
    },
  ],
};

describe("AgentReceiptCard", () => {
  it("renders outcome sections before low-level path details", () => {
    const html = renderToString(() => (
      <AgentReceiptCard
        receipt={buildAgentReceipt({
          kind: "applied",
          plan: PLAN,
          runLogPath: ".AgentRuns/run-1.md",
          undoPlanPath: ".AgentRuns/run-1-undo.md",
        })}
      />
    ));

    expect(html).toContain("Change receipt");
    expect(html).toContain("Created Tasks");
    expect(html).toContain("Send materials to Minji");
    expect(html).toContain("Needs approval");
    expect(html).toContain("OpenAI API fallback used after approval.");
    expect(html).toContain("<details");
    expect(html.indexOf("Send materials to Minji")).toBeLessThan(
      html.indexOf("Tasks/send-materials-to-minji.md"),
    );
  });

  it("renders invalid-plan summary without provider JSON or prompts", () => {
    const html = renderToString(() => (
      <AgentReceiptCard
        receipt={buildAgentReceipt({
          kind: "invalid_plan",
          sourceNote: "Inbox/raw.md",
          provider: { kind: "codex_cli", name: "codex" },
          validationErrors: ["plan.provider has unsupported fields"],
          runLogPath: ".AgentRuns/run-2.md",
        })}
      />
    ));

    expect(html).toContain("Plan needs review");
    expect(html).toContain("Validation summary");
    expect(html).toContain("plan.provider has unsupported fields");
    expect(html).not.toContain("```json");
    expect(html).not.toMatch(/raw provider|prompt|full response|diff/i);
  });
});
