import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentPlan } from "~/lib/momo/agent_plan";
import { exists, readFileWithChecksum, writeFile, writeFileWithChecksum } from "~/stores/vault";

import { defaultOrganizeInbox } from "./agent_panel_runtime";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("~/lib/vault_fs", () => ({
  listDirectory: vi.fn(async () => []),
  vaultMkdir: vi.fn(async () => undefined),
}));
vi.mock("~/stores/vault", () => ({
  exists: vi.fn(),
  readFileWithChecksum: vi.fn(),
  writeFile: vi.fn(),
  writeFileWithChecksum: vi.fn(),
}));

const SOURCE_NOTE = "Inbox/raw.md";
const SOURCE_BODY = "Email Joon about the homepage bug before Friday.";
const TASK_PATH = "Tasks/email-joon-about-homepage-bug.md";

const CODEX_PLAN: AgentPlan = {
  summary: "Created a follow-up task.",
  sourceNote: SOURCE_NOTE,
  provider: { kind: "codex_cli", name: "codex" },
  creates: [
    {
      kind: "managed_task",
      title: "Email Joon about homepage bug",
      sourceNote: SOURCE_NOTE,
      status: "todo",
      important: true,
      path: TASK_PATH,
    },
  ],
  updates: [
    {
      kind: "mark_inbox_processed",
      sourceNote: SOURCE_NOTE,
      organizedInto: [TASK_PATH],
    },
  ],
  approvalRequired: [],
};

describe("defaultOrganizeInbox", () => {
  let files: Map<string, string>;
  let folders: Set<string>;

  beforeEach(() => {
    files = new Map([[SOURCE_NOTE, SOURCE_BODY]]);
    folders = new Set(["Inbox"]);
    mockInvoke.mockReset();

    vi.mocked(exists).mockImplementation(async (path) => files.has(path) || folders.has(path));
    vi.mocked(readFileWithChecksum).mockImplementation(async (path) => ({
      content: files.get(path) ?? "",
      checksum: `checksum:${path}`,
    }));
    vi.mocked(writeFile).mockImplementation(async (path, content) => {
      files.set(path, content);
    });
    vi.mocked(writeFileWithChecksum).mockImplementation(async (path, content, checksum) => {
      expect(checksum).toBe(`checksum:${path}`);
      files.set(path, content);
      return { status: "Written", checksum: `checksum:${path}:next` };
    });
  });

  it("uses the production Codex adapter for the mounted dashboard action", async () => {
    mockInvoke.mockImplementation(async (command: string, args?: unknown) => {
      if (command === "agent_check_codex_readiness") return { ready: true };
      if (command === "plugin_get_settings_with_secrets") {
        expect(args).toEqual({
          pluginId: "ai-chat",
          secureKeys: ["apiKey"],
        });
        return {
          provider: "remote",
          apiKey: null,
          model: "gemini-3.1-flash-lite",
          serverUrl: "http://localhost:8080",
          codexModel: "gpt-5-codex",
          codexSandbox: "workspace-write",
          codexApprovalPolicy: "on-request",
          codexWebSearch: true,
          roundLimit: 12,
          proxyToolTimeoutMs: 15_000,
        };
      }
      if (command === "agent_create_codex_plan") {
        expect(args).toEqual({
          request: {
            sourceNote: SOURCE_NOTE,
            sourceMarkdown: SOURCE_BODY,
            relatedOutputs: [],
            codexConfig: {
              model: "gpt-5-codex",
              sandbox: "workspace-write",
            },
          },
        });
        return { kind: "plan", value: CODEX_PLAN };
      }
      throw new Error(`unexpected command: ${command}`);
    });

    const result = await defaultOrganizeInbox(SOURCE_NOTE);

    expect(result.status).toBe("applied");
    expect(files.get(TASK_PATH)).toContain("Email Joon about homepage bug");
    expect(files.get(SOURCE_NOTE)).toContain("processed: true");
    expect(mockInvoke).not.toHaveBeenCalledWith("agent_get_openai_api_key_status");
  });

  it("does not call OpenAI when Codex is not ready", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "agent_check_codex_readiness") return { ready: false };
      throw new Error(`unexpected command: ${command}`);
    });

    const result = await defaultOrganizeInbox(SOURCE_NOTE);

    expect(result).toEqual({
      status: "invalid_plan",
      errors: ["Codex CLI setup required"],
    });
    expect(files.get(TASK_PATH)).toBeUndefined();
    expect(files.get(SOURCE_NOTE)).toBe(SOURCE_BODY);
    expect(mockInvoke).not.toHaveBeenCalledWith("agent_create_openai_plan", expect.anything());
    expect(mockInvoke).not.toHaveBeenCalledWith("agent_get_openai_api_key_status");
  });
});
