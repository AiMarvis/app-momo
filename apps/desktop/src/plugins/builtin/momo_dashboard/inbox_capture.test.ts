import { describe, expect, it } from "vitest";

import {
  captureInboxNoteWithVault,
  getInboxAgentState,
  type InboxCaptureVault,
} from "./inbox_capture";

class FakeCaptureVault implements InboxCaptureVault {
  readonly files = new Map<string, string>();
  readonly folders = new Set<string>();

  constructor(existing: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(existing)) {
      this.files.set(path, content);
    }
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path);
  }

  async mkdir(path: string): Promise<void> {
    this.folders.add(path);
  }

  async readFile(path: string): Promise<string> {
    return this.files.get(path) ?? "";
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
}

describe("Momo inbox capture", () => {
  it("writes one Inbox markdown file and preserves the captured body byte-for-byte", async () => {
    const vault = new FakeCaptureVault();

    const result = await captureInboxNoteWithVault("lecture followup with Minji", vault);

    expect(result).toEqual({
      status: "created",
      path: "Inbox/lecture-followup-with-minji.md",
      body: "lecture followup with Minji",
    });
    expect([...vault.files.entries()]).toEqual([
      ["Inbox/lecture-followup-with-minji.md", "lecture followup with Minji"],
    ]);
  });

  it("keeps capture filenames inside Inbox when text is path-like or collides", async () => {
    const vault = new FakeCaptureVault({
      "Inbox/escape.md": "older",
    });

    const result = await captureInboxNoteWithVault("../escape", vault);

    expect(result.status).toBe("created");
    if (result.status !== "created") return;
    expect(result.path).toBe("Inbox/escape-2.md");
    expect(vault.files.get(result.path)).toBe("../escape");
  });

  it("rejects empty capture text without writing a file", async () => {
    const vault = new FakeCaptureVault();

    const result = await captureInboxNoteWithVault("   \n\t", vault);

    expect(result).toEqual({ status: "empty" });
    expect(vault.files.size).toBe(0);
  });
});

describe("Momo inbox agent state", () => {
  it("shows processed Inbox notes as already organized with receipt actions", async () => {
    const vault = new FakeCaptureVault({
      "Inbox/done.md": "---\nprocessed: true\nagent_run: .AgentRuns/run-1.md\n---\nOriginal body",
    });

    const state = await getInboxAgentState(["Inbox/done.md"], vault);

    expect(state).toEqual({
      kind: "processed",
      path: "Inbox/done.md",
      agentRun: ".AgentRuns/run-1.md",
    });
  });

  it("marks multiple selected Inbox notes as batch unavailable", async () => {
    const vault = new FakeCaptureVault();

    const state = await getInboxAgentState(["Inbox/a.md", "Inbox/b.md"], vault);

    expect(state).toEqual({ kind: "batch_unavailable", count: 2 });
  });
});
