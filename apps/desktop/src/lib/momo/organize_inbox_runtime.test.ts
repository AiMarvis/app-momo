import { describe, expect, it, vi } from "vitest";

import type { AgentPlan } from "./agent_plan";
import type { ProviderAdapterOutput } from "./agent_provider_adapters";
import { organizeSelectedInboxNotes, type OrganizeInboxVault } from "./organize_inbox_runtime";

const SOURCE_NOTE = "Inbox/raw.md";
const SOURCE_BODY = "Remember to send Minji the lecture materials.\n\nKeep this body intact.";

class FakeOrganizeVault implements OrganizeInboxVault {
  readonly files = new Map<string, string>();
  readonly folders = new Set<string>();
  readonly staleChecksumPaths = new Set<string>();

  constructor(
    files: Record<string, string>,
    options?: { readonly staleChecksumPaths?: readonly string[] },
  ) {
    for (const [path, content] of Object.entries(files)) {
      this.files.set(path, content);
      const directory = dirname(path);
      if (directory !== null) this.folders.add(directory);
    }
    for (const path of options?.staleChecksumPaths ?? []) {
      this.staleChecksumPaths.add(path);
    }
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path);
  }

  async mkdir(path: string): Promise<void> {
    this.folders.add(path);
  }

  async readFileWithChecksum(
    path: string,
  ): Promise<{ readonly content: string; readonly checksum: string }> {
    const checksum = this.staleChecksumPaths.has(path) ? `stale:${path}` : `checksum:${path}`;
    return { content: this.files.get(path) ?? "", checksum };
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    const directory = dirname(path);
    if (directory !== null) this.folders.add(directory);
  }

  async writeFileWithChecksum(
    path: string,
    content: string,
    checksum: string,
  ): Promise<
    | { readonly status: "Conflict"; readonly expected: string; readonly actual: string }
    | { readonly status: "Written"; readonly checksum: string }
  > {
    if (checksum !== `checksum:${path}`) {
      return { status: "Conflict", expected: checksum, actual: `checksum:${path}` };
    }
    await this.writeFile(path, content);
    return { status: "Written", checksum: `checksum:${path}:next` };
  }
}

describe("Organize Inbox safe runtime", () => {
  it("safe one-note run applies safe outputs, preserves source body, writes one receipt/log/undo", async () => {
    const vault = new FakeOrganizeVault({ [SOURCE_NOTE]: SOURCE_BODY });
    const codexPlan = vi.fn(async () => safePlan());

    const result = await organizeSelectedInboxNotes({
      selectedPaths: [SOURCE_NOTE],
      vault,
      codex: { ready: async () => true, createPlan: codexPlan },
      openai: { byokReady: async () => false, createPlan: vi.fn(async () => failedProvider()) },
      askOpenAiFallbackApproval: vi.fn(async () => false),
      nowIso: () => "2026-06-28T00:00:00.000Z",
    });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(codexPlan).toHaveBeenCalledWith({
      sourceNote: SOURCE_NOTE,
      sourceMarkdown: SOURCE_BODY,
      relatedOutputs: [],
    });

    expect(vault.files.get("Tasks/send-materials-to-minji.md")).toContain("type: task");
    expect(vault.files.get("Issues/finalize-dashboard.md")).toContain("type: issue");
    expect(vault.files.get("Projects/june-lecture.md")).toContain("project_type: life");

    const processedSource = vault.files.get(SOURCE_NOTE) ?? "";
    expect(processedSource).toContain("processed: true");
    expect(processedSource).toContain(`agent_run: ${result.runLogPath}`);
    expect(processedSource).toContain(SOURCE_BODY);
    expect(processedSource).toContain("[[Tasks/send-materials-to-minji]]");
    expect(processedSource).toContain("[[Issues/finalize-dashboard]]");

    const agentRunFiles = [...vault.files.keys()]
      .filter((path) => path.startsWith(".AgentRuns/"))
      .sort();
    expect(agentRunFiles).toEqual([
      result.changeReceiptPath,
      result.runLogPath,
      result.undoPlanPath,
    ]);
    expect(vault.files.get(result.runLogPath)).toContain("status: applied");
    expect(vault.files.get(result.changeReceiptPath)).toContain("Change receipt");
    expect(vault.files.get(result.undoPlanPath)).toContain("delete_created_file");
    expect(result.receipt.visibleText).toContain("Send materials to Minji");
  });

  it("safety rejects invalid plans, approval-required plans, and multiple selections with no partial apply", async () => {
    const invalidVault = new FakeOrganizeVault({ [SOURCE_NOTE]: SOURCE_BODY });
    const invalidResult = await organizeSelectedInboxNotes({
      selectedPaths: [SOURCE_NOTE],
      vault: invalidVault,
      codex: {
        ready: async () => true,
        createPlan: vi.fn(async () => ({
          kind: "plan" as const,
          value: { summary: "not enough" },
        })),
      },
      openai: { byokReady: async () => false, createPlan: vi.fn(async () => failedProvider()) },
      askOpenAiFallbackApproval: vi.fn(async () => false),
      nowIso: () => "2026-06-28T00:00:00.000Z",
    });
    expect(invalidResult.status).toBe("invalid_plan");
    expect(invalidVault.files.get(SOURCE_NOTE)).toBe(SOURCE_BODY);
    expect([...invalidVault.files.keys()].filter((path) => path !== SOURCE_NOTE)).toEqual([]);

    const approvalVault = new FakeOrganizeVault({ [SOURCE_NOTE]: SOURCE_BODY });
    const approvalResult = await organizeSelectedInboxNotes({
      selectedPaths: [SOURCE_NOTE],
      vault: approvalVault,
      codex: { ready: async () => true, createPlan: vi.fn(async () => approvalRequiredPlan()) },
      openai: { byokReady: async () => false, createPlan: vi.fn(async () => failedProvider()) },
      askOpenAiFallbackApproval: vi.fn(async () => false),
      nowIso: () => "2026-06-28T00:00:00.000Z",
    });
    expect(approvalResult).toEqual({
      status: "blocked_approval_required",
      errors: ["Approval-required changes are not applied in this Organize Inbox slice"],
    });
    expect(approvalVault.files.get(SOURCE_NOTE)).toBe(SOURCE_BODY);
    expect([...approvalVault.files.keys()].filter((path) => path !== SOURCE_NOTE)).toEqual([]);

    const multipleProvider = vi.fn(async () => safePlan());
    const multipleResult = await organizeSelectedInboxNotes({
      selectedPaths: [SOURCE_NOTE, "Inbox/other.md"],
      vault: new FakeOrganizeVault({ [SOURCE_NOTE]: SOURCE_BODY, "Inbox/other.md": "Other" }),
      codex: { ready: async () => true, createPlan: multipleProvider },
      openai: { byokReady: async () => false, createPlan: vi.fn(async () => failedProvider()) },
      askOpenAiFallbackApproval: vi.fn(async () => false),
      nowIso: () => "2026-06-28T00:00:00.000Z",
    });
    expect(multipleResult).toEqual({
      status: "rejected_selection",
      errors: ["Organize Inbox processes exactly one Inbox Note"],
    });
    expect(multipleProvider).not.toHaveBeenCalled();

    const conflictVault = new FakeOrganizeVault(
      { [SOURCE_NOTE]: SOURCE_BODY },
      { staleChecksumPaths: [SOURCE_NOTE] },
    );
    const conflictResult = await organizeSelectedInboxNotes({
      selectedPaths: [SOURCE_NOTE],
      vault: conflictVault,
      codex: { ready: async () => true, createPlan: vi.fn(async () => safePlan()) },
      openai: { byokReady: async () => false, createPlan: vi.fn(async () => failedProvider()) },
      askOpenAiFallbackApproval: vi.fn(async () => false),
      nowIso: () => "2026-06-28T00:00:00.000Z",
    });
    expect(conflictResult).toEqual({
      status: "source_conflict",
      errors: [`source note changed before apply: ${SOURCE_NOTE}`],
    });
    expect(conflictVault.files.get(SOURCE_NOTE)).toBe(SOURCE_BODY);
    expect([...conflictVault.files.keys()].filter((path) => path !== SOURCE_NOTE)).toEqual([]);
  });
});

function safePlan(): AgentPlan {
  return {
    summary: "Created lecture follow-up work.",
    sourceNote: SOURCE_NOTE,
    provider: { kind: "codex_cli", name: "codex" },
    creates: [
      {
        kind: "managed_task",
        title: "Send materials to Minji",
        sourceNote: SOURCE_NOTE,
        status: "todo",
        path: "Tasks/send-materials-to-minji.md",
        important: true,
      },
      {
        kind: "build_issue",
        title: "Finalize dashboard",
        sourceNote: SOURCE_NOTE,
        status: "todo",
        priority: "high",
        path: "Issues/finalize-dashboard.md",
        blocked: false,
      },
      {
        kind: "project",
        title: "June Lecture",
        sourceNote: SOURCE_NOTE,
        projectType: "life",
        path: "Projects/june-lecture.md",
      },
    ],
    updates: [
      {
        kind: "mark_inbox_processed",
        sourceNote: SOURCE_NOTE,
        organizedInto: ["Tasks/send-materials-to-minji.md", "Issues/finalize-dashboard.md"],
      },
    ],
    approvalRequired: [],
  };
}

function approvalRequiredPlan(): AgentPlan {
  return {
    ...safePlan(),
    creates: [],
    updates: [],
    approvalRequired: [
      {
        kind: "existing_note_update",
        summary: "Rewrite existing project body",
        path: "Projects/june-lecture.md",
      },
    ],
  };
}

function failedProvider(): ProviderAdapterOutput {
  return { kind: "failed", reason: "unused provider" };
}

function dirname(path: string): string | null {
  const index = path.lastIndexOf("/");
  return index === -1 ? null : path.slice(0, index);
}
