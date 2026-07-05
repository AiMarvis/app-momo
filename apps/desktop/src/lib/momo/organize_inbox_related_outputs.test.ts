import { describe, expect, it, vi } from "vitest";

import type { AgentPlan } from "./agent_plan";
import type { ProviderAdapterOutput } from "./agent_provider_adapters";
import { organizeSelectedInboxNotes, type OrganizeInboxVault } from "./organize_inbox_runtime";

const SOURCE_NOTE = "Inbox/raw.md";
const SOURCE_BODY = "Follow up with Joon about the homepage bug.";
const EXISTING_TASK = "Tasks/existing-homepage-follow-up.md";
const UNRELATED_TASK = "Tasks/unrelated.md";
const NEW_TASK = "Tasks/email-joon-about-homepage-bug.md";

const PLAN: AgentPlan = {
  summary: "Created a homepage bug follow-up task.",
  sourceNote: SOURCE_NOTE,
  provider: { kind: "codex_cli", name: "codex" },
  creates: [
    {
      kind: "managed_task",
      title: "Email Joon about homepage bug",
      sourceNote: SOURCE_NOTE,
      status: "todo",
      important: true,
      path: NEW_TASK,
    },
  ],
  updates: [
    {
      kind: "mark_inbox_processed",
      sourceNote: SOURCE_NOTE,
      organizedInto: [NEW_TASK],
    },
  ],
  approvalRequired: [],
};

class FakeRelatedVault implements OrganizeInboxVault {
  readonly files = new Map<string, string>([
    [SOURCE_NOTE, SOURCE_BODY],
    [EXISTING_TASK, `---\ntype: task\nsource_note: ${SOURCE_NOTE}\n---\n\n# Existing follow-up\n`],
    [UNRELATED_TASK, "---\ntype: task\nsource_note: Inbox/other.md\n---\n\n# Unrelated task\n"],
  ]);
  readonly folders = new Set<string>(["Inbox", "Tasks"]);

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path);
  }

  async listDirectory(path: string) {
    if (path !== "Tasks") return [];
    return [
      { name: "existing-homepage-follow-up.md", path: EXISTING_TASK, is_directory: false },
      { name: "unrelated.md", path: UNRELATED_TASK, is_directory: false },
    ];
  }

  async mkdir(path: string): Promise<void> {
    this.folders.add(path);
  }

  async readFileWithChecksum(path: string) {
    return { content: this.files.get(path) ?? "", checksum: `checksum:${path}` };
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async writeFileWithChecksum(path: string, content: string, checksum: string) {
    expect(checksum).toBe(`checksum:${path}`);
    this.files.set(path, content);
    return { status: "Written" as const, checksum: `checksum:${path}:next` };
  }
}

describe("organizeSelectedInboxNotes related outputs", () => {
  it("sends source-linked existing Momo outputs as bounded provider context", async () => {
    const vault = new FakeRelatedVault();
    const createPlan = vi.fn(async (request) => {
      expect(request.relatedOutputs).toHaveLength(1);
      expect(request.relatedOutputs?.[0]).toContain(`Path: ${EXISTING_TASK}`);
      expect(request.relatedOutputs?.[0]).toContain(`source_note: ${SOURCE_NOTE}`);
      expect(request.relatedOutputs?.[0]).not.toContain("Unrelated task");
      return PLAN;
    });

    const result = await organizeSelectedInboxNotes({
      selectedPaths: [SOURCE_NOTE],
      vault,
      codex: { ready: async () => true, createPlan },
      openai: { byokReady: async () => false, createPlan: vi.fn(async () => failedProvider()) },
      askOpenAiFallbackApproval: vi.fn(async () => false),
      nowIso: () => "2026-06-28T00:00:00.000Z",
    });

    expect(result.status).toBe("applied");
    expect(createPlan).toHaveBeenCalledOnce();
    expect(vault.files.get(NEW_TASK)).toContain("Email Joon about homepage bug");
  });
});

function failedProvider(): ProviderAdapterOutput {
  return { kind: "failed", reason: "unused provider" };
}
