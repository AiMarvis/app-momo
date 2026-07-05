import { renderToString } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";

import { buildAgentReceipt } from "~/lib/momo/agent_receipt";
import type { AgentPlan } from "~/lib/momo/agent_plan";
import type { ProviderAdapterOutput } from "~/lib/momo/agent_provider_adapters";
import {
  organizeSelectedInboxNotes,
  type OrganizeInboxVault,
} from "~/lib/momo/organize_inbox_runtime";

import { agentPanelCopyForState } from "./agent_panel";
import { AgentActionButton, AgentRunFeedback, type AgentRunState } from "./agent_panel_cards";
import { runOrganizeForPanel } from "./agent_panel_runtime";

vi.mock("~/lib/vault_fs", () => ({ listDirectory: vi.fn(async () => []), vaultMkdir: vi.fn() }));
vi.mock("~/stores/files", () => ({ openTab: vi.fn() }));
vi.mock("~/stores/vault", () => ({
  exists: vi.fn(),
  loadFiles: vi.fn(),
  readFile: vi.fn(async () => SOURCE_BODY),
  readFileWithChecksum: vi.fn(),
  vaultState: { selectedPath: null, rootPath: null },
  writeFile: vi.fn(),
  writeFileWithChecksum: vi.fn(),
}));

const SOURCE_NOTE = "Inbox/raw.md";
const SOURCE_BODY = "Remember to send Minji the lecture materials.";

const PLAN: AgentPlan = {
  summary: "Created lecture follow-up work.",
  sourceNote: SOURCE_NOTE,
  provider: { kind: "codex_cli", name: "codex" },
  creates: [
    {
      kind: "managed_task",
      title: "Send materials to Minji",
      sourceNote: SOURCE_NOTE,
      status: "todo",
      important: true,
      path: "Tasks/send-materials-to-minji.md",
    },
  ],
  updates: [
    {
      kind: "mark_inbox_processed",
      sourceNote: SOURCE_NOTE,
      organizedInto: ["Tasks/send-materials-to-minji.md"],
    },
  ],
  approvalRequired: [],
};

class FakePanelVault implements OrganizeInboxVault {
  readonly files = new Map<string, string>([[SOURCE_NOTE, SOURCE_BODY]]);
  readonly folders = new Set<string>(["Inbox"]);

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path);
  }

  async mkdir(path: string): Promise<void> {
    this.folders.add(path);
  }

  async readFileWithChecksum(
    path: string,
  ): Promise<{ readonly content: string; readonly checksum: string }> {
    return { content: this.files.get(path) ?? "", checksum: `checksum:${path}` };
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async writeFileWithChecksum(
    path: string,
    content: string,
    checksum: string,
  ): Promise<{ readonly status: "Written"; readonly checksum: string }> {
    expect(checksum).toBe(`checksum:${path}`);
    this.files.set(path, content);
    return { status: "Written", checksum: `checksum:${path}:next` };
  }
}

describe("MomoAgentPanel", () => {
  it("renders action button states", () => {
    const idleHtml = renderToString(() => (
      <AgentActionButton running={false} onClick={() => undefined} />
    ));
    const runningHtml = renderToString(() => (
      <AgentActionButton running={true} onClick={() => undefined} />
    ));

    expect(idleHtml).toContain("Organize Inbox");
    expect(idleHtml).not.toMatch(/\sdisabled(=|>)/);
    expect(runningHtml).toContain("Organizing");
    expect(runningHtml).toMatch(/\sdisabled(=|>)/);
  });

  it("renders applied receipts and stopped feedback", () => {
    const receipt = buildAgentReceipt({
      kind: "applied",
      plan: PLAN,
      runLogPath: ".AgentRuns/run-1.md",
      undoPlanPath: ".AgentRuns/run-1-undo.md",
    });
    const appliedHtml = renderToString(() => (
      <AgentRunFeedback state={{ kind: "applied", receipt }} />
    ));
    const stoppedHtml = renderToString(() => (
      <AgentRunFeedback
        state={{ kind: "failed", title: "Plan stopped", detail: "No vault changes applied" }}
      />
    ));

    expect(appliedHtml).toContain("Change receipt");
    expect(appliedHtml).toContain("Send materials to Minji");
    expect(stoppedHtml).toContain("Plan stopped");
    expect(stoppedHtml).toContain("No vault changes applied");
  });

  it("keeps selection copy strict to one Inbox note", () => {
    expect(agentPanelCopyForState({ kind: "empty" }).title).toBe("Choose one Inbox note");
    expect(agentPanelCopyForState({ kind: "batch_unavailable", count: 2 }).title).toBe(
      "Choose one Inbox note",
    );
    expect(agentPanelCopyForState({ kind: "not_inbox", path: "Projects/x.md" }).title).toBe(
      "Choose one Inbox note",
    );
    expect(agentPanelCopyForState({ kind: "ready", path: SOURCE_NOTE })).toEqual({
      title: "Idle",
      detail: SOURCE_NOTE,
    });
  });

  it("runs the selected Inbox note through the panel organize action and shows the applied receipt", async () => {
    const vault = new FakePanelVault();
    const createPlan = vi.fn(async () => PLAN);
    const states: AgentRunState[] = [];
    const reloadVault = vi.fn(async () => undefined);
    const refetchAgentState = vi.fn(async () => undefined);
    const organizeInbox = vi.fn((sourceNote: string) =>
      organizeSelectedInboxNotes({
        selectedPaths: [sourceNote],
        vault,
        codex: { ready: async () => true, createPlan },
        openai: { byokReady: async () => false, createPlan: vi.fn(async () => failedProvider()) },
        askOpenAiFallbackApproval: vi.fn(async () => false),
        nowIso: () => "2026-06-28T00:00:00.000Z",
      }),
    );

    await runOrganizeForPanel({
      sourceNote: SOURCE_NOTE,
      organizeInbox,
      rootPath: "/tmp/momo-vault",
      reloadVault,
      refetchAgentState,
      setRunState: (state) => states.push(state),
    });

    expect(states[0]).toEqual({ kind: "running" });
    expect(states.at(-1)?.kind).toBe("applied");
    expect(organizeInbox).toHaveBeenCalledWith(SOURCE_NOTE);
    expect(createPlan).toHaveBeenCalledWith({
      sourceNote: SOURCE_NOTE,
      sourceMarkdown: SOURCE_BODY,
      relatedOutputs: [],
    });
    expect(vault.files.get(SOURCE_NOTE)).toContain("processed: true");
    expect(vault.files.get("Tasks/send-materials-to-minji.md")).toContain("type: task");
    expect(reloadVault).toHaveBeenCalledWith("/tmp/momo-vault");
    expect(refetchAgentState).toHaveBeenCalledOnce();
  });
});

function failedProvider(): ProviderAdapterOutput {
  return { kind: "failed", reason: "unused provider" };
}
