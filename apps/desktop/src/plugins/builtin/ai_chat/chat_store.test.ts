import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();
const mockReadVaultFileWithChecksum = vi.fn();
const mockContextSnapshot = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("~/lib/vault_fs", () => ({
  readVaultFileWithChecksum: mockReadVaultFileWithChecksum,
}));

vi.mock("./approval_diff", () => ({
  openApprovalDiff: vi.fn(),
}));

vi.mock("./context_snapshot", () => ({
  createContextSnapshotSource: () => ({
    snapshot: mockContextSnapshot,
  }),
}));

vi.mock("./responding_state", () => ({
  hasRespondingSession: () => false,
}));

vi.mock("~/plugins/context_keys", () => ({
  setContextKey: vi.fn(),
}));

async function loadChatStoreModule() {
  vi.resetModules();
  return import("./chat_store");
}

function defaultEditorContext() {
  return {
    activeFile: null,
    selectedText: null,
    openTabs: [],
    cursorLine: null,
  };
}

function codexReadyResponse() {
  return {
    provider: "codex_cli",
    status: "ready",
    ready: true,
    checkName: "codex login status",
    exitCode: 0,
    timedOut: false,
    checkedAtMs: 1,
  };
}

async function refreshCodexReadyProvider(): Promise<void> {
  const agent = await import("./agent_provider");
  await agent.refreshAgentProviderStatus();
}

describe("ai_chat chat_store config", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockReadVaultFileWithChecksum.mockReset();
    mockContextSnapshot.mockReset();
    mockContextSnapshot.mockImplementation(defaultEditorContext);
  });

  it("loads persisted plugin settings and pins server url + model to build defaults", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "plugin_get_settings_with_secrets":
          return {
            provider: "remote",
            apiKey: null,
            model: "gemini-3.1-flash-lite-preview",
            serverUrl: "https://www.kuku.mom",
            defaultMode: "agent",
            codexModel: "gpt-5-codex",
            codexSandbox: "workspace-write",
            codexApprovalPolicy: "on-request",
            codexWebSearch: true,
            roundLimit: 16,
            proxyToolTimeoutMs: 30_000,
          };
        case "plugin_save_settings_with_secrets":
        case "plugin:kuku-ai|ai_set_config":
          return undefined;
        default:
          throw new Error(`unexpected invoke: ${command}`);
      }
    });

    const chat = await loadChatStoreModule();

    await chat.loadConfig();

    expect(mockInvoke).toHaveBeenCalledWith("plugin_get_settings_with_secrets", {
      pluginId: "ai-chat",
      secureKeys: ["apiKey"],
    });
    // serverUrl and model are pinned to build defaults — persisted values for
    // those fields are intentionally dropped so the runtime targets the
    // backend this build was compiled against.
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "plugin_save_settings_with_secrets", {
      pluginId: "ai-chat",
      settings: {
        provider: "remote",
        apiKey: null,
        model: "gemini-3.1-flash-lite",
        serverUrl: "http://localhost:8080",
        defaultMode: "agent",
        codexModel: "gpt-5-codex",
        codexSandbox: "workspace-write",
        codexApprovalPolicy: "default",
        codexWebSearch: false,
        roundLimit: 16,
        proxyToolTimeoutMs: 30_000,
      },
      secureKeys: ["apiKey"],
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(3, "plugin:kuku-ai|ai_set_config", {
      config: {
        provider: "remote",
        apiKey: null,
        model: "gemini-3.1-flash-lite",
        serverUrl: "http://localhost:8080",
        defaultMode: "agent",
        codexModel: "gpt-5-codex",
        codexSandbox: "workspace-write",
        codexApprovalPolicy: "default",
        codexWebSearch: false,
        roundLimit: 16,
        proxyToolTimeoutMs: 30_000,
      },
    });
    expect(chat.chatState.config.provider).toBe("remote");
    expect(chat.chatState.config.model).toBe("gemini-3.1-flash-lite");
    expect(chat.chatState.config.serverUrl).toBe("http://localhost:8080");
    expect(chat.chatState.selectedMode).toBe("agent");
    expect(chat.chatState.config.codexModel).toBe("gpt-5-codex");
    expect(chat.chatState.config.codexSandbox).toBe("workspace-write");
    expect(chat.chatState.config.codexApprovalPolicy).toBe("default");
    expect(chat.chatState.config.codexWebSearch).toBe(false);
  });

  it("pins saved plugin settings to the build default model before syncing runtime config", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "plugin_save_settings_with_secrets":
        case "plugin:kuku-ai|ai_set_config":
          return undefined;
        default:
          throw new Error(`unexpected invoke: ${command}`);
      }
    });

    const chat = await loadChatStoreModule();

    const saved = await chat.saveConfig({
      provider: "remote",
      apiKey: "",
      serverUrl: "https://saved",
      defaultMode: "inline",
      codexModel: "gpt-5",
      codexSandbox: "danger-full-access",
    });

    expect(saved).toBe(true);
    expect(mockInvoke).toHaveBeenNthCalledWith(1, "plugin_save_settings_with_secrets", {
      pluginId: "ai-chat",
      settings: {
        provider: "remote",
        apiKey: null,
        model: "gemini-3.1-flash-lite",
        serverUrl: "https://saved",
        defaultMode: "inline",
        codexModel: "gpt-5",
        codexSandbox: "danger-full-access",
        codexApprovalPolicy: "default",
        codexWebSearch: false,
        roundLimit: 12,
        proxyToolTimeoutMs: 15_000,
      },
      secureKeys: ["apiKey"],
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "plugin:kuku-ai|ai_set_config", {
      config: {
        provider: "remote",
        apiKey: null,
        model: "gemini-3.1-flash-lite",
        serverUrl: "https://saved",
        defaultMode: "inline",
        codexModel: "gpt-5",
        codexSandbox: "danger-full-access",
        codexApprovalPolicy: "default",
        codexWebSearch: false,
        roundLimit: 12,
        proxyToolTimeoutMs: 15_000,
      },
    });
    expect(chat.chatState.selectedMode).toBe("inline");
  });

  it("returns false when saving settings fails", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "plugin_save_settings_with_secrets":
          throw new Error("settings save failed");
        default:
          throw new Error(`unexpected invoke: ${command}`);
      }
    });

    const chat = await loadChatStoreModule();

    const saved = await chat.saveConfig({
      provider: "remote",
      apiKey: "",
      serverUrl: "https://saved",
      defaultMode: "ask",
      codexModel: "",
      codexSandbox: "read-only",
    });

    expect(saved).toBe(false);
    expect(chat.chatState.config.error).toBe("settings save failed");
    expect(chat.chatState.config.saving).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalledWith("plugin:kuku-ai|ai_set_config", expect.anything());
  });

  it("clears persisted secure settings through secure-aware command", async () => {
    mockInvoke.mockResolvedValue(undefined);

    const chat = await loadChatStoreModule();

    await chat.clearPersistedConfig();

    expect(mockInvoke).toHaveBeenCalledWith("plugin_clear_settings_with_secrets", {
      pluginId: "ai-chat",
      secureKeys: ["apiKey"],
    });
  });
});

describe("ai_chat chat_store session modes", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockReadVaultFileWithChecksum.mockReset();
    mockContextSnapshot.mockReset();
    mockContextSnapshot.mockImplementation(defaultEditorContext);
  });

  it("switches mode without creating a new session", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "plugin:kuku-ai|ai_new_session":
          return { sessionId: "session-1" };
        default:
          throw new Error(`unexpected invoke: ${command}`);
      }
    });

    const chat = await loadChatStoreModule();

    await chat.createSession("ask");
    chat.setDraft("keep this draft");
    await chat.switchMode("agent");

    expect(chat.chatState.activeSessionId).toBe("session-1");
    expect(chat.chatState.selectedMode).toBe("agent");
    expect(chat.chatState.sessions["session-1"]?.mode).toBe("agent");
    expect(chat.chatState.sessions["session-1"]?.draft).toBe("keep this draft");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("plugin:kuku-ai|ai_new_session", {
      mode: "ask",
    });
  });

  it("can switch back to ask mode without creating a new session", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "plugin:kuku-ai|ai_new_session":
          return { sessionId: "session-1" };
        default:
          throw new Error(`unexpected invoke: ${command}`);
      }
    });

    const chat = await loadChatStoreModule();

    await chat.createSession("ask");
    await chat.switchMode("agent");
    await chat.switchMode("ask");

    expect(chat.chatState.activeSessionId).toBe("session-1");
    expect(chat.chatState.selectedMode).toBe("ask");
    expect(chat.chatState.sessions["session-1"]?.mode).toBe("ask");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("keeps the current session when sending after a mode switch", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "agent_check_codex_readiness":
          return codexReadyResponse();
        case "agent_get_openai_api_key_status":
          return { configured: false };
        case "plugin:kuku-ai|ai_new_session":
          return { sessionId: "session-1" };
        case "agent_run_codex_chat":
          return { content: "Edited." };
        default:
          throw new Error(`unexpected invoke: ${command}`);
      }
    });

    const chat = await loadChatStoreModule();
    await refreshCodexReadyProvider();

    await chat.createSession("ask");
    await chat.switchMode("agent");
    await chat.sendMessage("edit this note");

    expect(chat.chatState.activeSessionId).toBe("session-1");
    expect(chat.chatState.sessions["session-1"]?.messages).toMatchObject([
      {
        kind: "text",
        role: "user",
        content: "edit this note",
      },
      {
        kind: "text",
        role: "assistant",
        content: "Edited.",
      },
    ]);
    expect(mockInvoke).toHaveBeenCalledWith("agent_run_codex_chat", {
      request: {
        content: "edit this note",
        mode: "agent",
        codexConfig: {
          sandbox: "read-only",
        },
        editorContext: {
          activeFile: null,
          selectedText: null,
          openTabs: [],
          cursorLine: null,
          embeddedFiles: [],
        },
      },
    });
    expect(mockInvoke).not.toHaveBeenCalledWith("plugin:kuku-ai|ai_send_message", expect.anything());
  });

  it("sends through Codex CLI when Codex is the ready provider", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "agent_check_codex_readiness":
          return {
            provider: "codex_cli",
            status: "ready",
            ready: true,
            checkName: "codex login status",
            exitCode: 0,
            timedOut: false,
            checkedAtMs: 1,
          };
        case "agent_get_openai_api_key_status":
          return { configured: false };
        case "plugin:kuku-ai|ai_new_session":
          return { sessionId: "session-1" };
        case "agent_run_codex_chat":
          return { content: "MOMO_CODEX_CLI_OK" };
        default:
          throw new Error(`unexpected invoke: ${command}`);
      }
    });

    const chat = await loadChatStoreModule();
    const agent = await import("./agent_provider");
    await agent.refreshAgentProviderStatus();

    await chat.createSession("ask");
    await chat.sendMessage("say ok");

    expect(mockInvoke).toHaveBeenCalledWith("agent_run_codex_chat", {
      request: {
        content: "say ok",
        mode: "ask",
        codexConfig: {
          sandbox: "read-only",
        },
        editorContext: {
          activeFile: null,
          selectedText: null,
          openTabs: [],
          cursorLine: null,
          embeddedFiles: [],
        },
      },
    });
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "plugin:kuku-ai|ai_send_message",
      expect.anything(),
    );
    expect(chat.chatState.sessions["session-1"]?.messages).toMatchObject([
      { kind: "text", role: "user", content: "say ok" },
      { kind: "text", role: "assistant", content: "MOMO_CODEX_CLI_OK" },
    ]);
    expect(chat.chatState.sessions["session-1"]?.status).toBe("idle");
  });

  it("sends saved Codex CLI settings with chat requests", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "plugin_get_settings_with_secrets":
          return {
            provider: "remote",
            apiKey: null,
            model: "gemini-3.1-flash-lite",
            serverUrl: "http://localhost:8080",
            defaultMode: "agent",
            codexModel: "gpt-5-codex",
            codexSandbox: "workspace-write",
            codexApprovalPolicy: "on-request",
            codexWebSearch: true,
            roundLimit: 12,
            proxyToolTimeoutMs: 15_000,
          };
        case "plugin_save_settings_with_secrets":
        case "plugin:kuku-ai|ai_set_config":
          return undefined;
        case "agent_check_codex_readiness":
          return codexReadyResponse();
        case "agent_get_openai_api_key_status":
          return { configured: false };
        case "plugin:kuku-ai|ai_new_session":
          return { sessionId: "session-1" };
        case "agent_run_codex_chat":
          return { content: "Configured." };
        default:
          throw new Error(`unexpected invoke: ${command}`);
      }
    });

    const chat = await loadChatStoreModule();
    await chat.loadConfig();
    await refreshCodexReadyProvider();

    await chat.createSession();
    await chat.sendMessage("use saved settings");

    expect(chat.chatState.selectedMode).toBe("agent");
    expect(mockInvoke).toHaveBeenCalledWith("agent_run_codex_chat", {
      request: {
        content: "use saved settings",
        mode: "agent",
        codexConfig: {
          model: "gpt-5-codex",
          sandbox: "workspace-write",
        },
        editorContext: {
          activeFile: null,
          selectedText: null,
          openTabs: [],
          cursorLine: null,
          embeddedFiles: [],
        },
      },
    });
  });

  it("shows a short error and skips legacy send when Codex is not ready", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "plugin:kuku-ai|ai_new_session":
          return { sessionId: "session-1" };
        default:
          throw new Error(`unexpected invoke: ${command}`);
      }
    });

    const chat = await loadChatStoreModule();

    await chat.sendMessage("hello");

    expect(chat.chatState.sessions["session-1"]?.status).toBe("error");
    expect(chat.chatState.sessions["session-1"]?.error).toBe("Codex CLI is not ready");
    expect(chat.chatState.sessions["session-1"]?.messages).toMatchObject([
      { kind: "text", role: "user", content: "hello" },
      { kind: "text", role: "system", content: "Codex CLI is not ready" },
    ]);
    expect(mockInvoke).not.toHaveBeenCalledWith("agent_run_codex_chat", expect.anything());
    expect(mockInvoke).not.toHaveBeenCalledWith("plugin:kuku-ai|ai_send_message", expect.anything());
  });

  it("allows the next Codex message after a failed turn", async () => {
    let codexChatCalls = 0;
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "agent_check_codex_readiness":
          return codexReadyResponse();
        case "agent_get_openai_api_key_status":
          return { configured: false };
        case "plugin:kuku-ai|ai_new_session":
          return { sessionId: "session-1" };
        case "agent_run_codex_chat":
          codexChatCalls += 1;
          if (codexChatCalls === 1) {
            throw new Error("Codex chat command failed with exit code 1");
          }
          return { content: "Recovered." };
        default:
          throw new Error(`unexpected invoke: ${command}`);
      }
    });

    const chat = await loadChatStoreModule();
    await refreshCodexReadyProvider();

    await chat.createSession("ask");
    expect(await chat.sendMessage("first turn")).toBe(true);
    expect(chat.chatState.sessions["session-1"]?.status).toBe("error");

    expect(await chat.sendMessage("second turn")).toBe(true);

    expect(codexChatCalls).toBe(2);
    expect(chat.chatState.sessions["session-1"]?.status).toBe("idle");
    expect(chat.chatState.sessions["session-1"]?.messages).toMatchObject([
      { kind: "text", role: "user", content: "first turn" },
      {
        kind: "text",
        role: "system",
        content: "Codex chat command failed with exit code 1",
      },
      { kind: "text", role: "user", content: "second turn" },
      { kind: "text", role: "assistant", content: "Recovered." },
    ]);
  });

  it("sends attached files as embedded editor context", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "agent_check_codex_readiness":
          return codexReadyResponse();
        case "agent_get_openai_api_key_status":
          return { configured: false };
        case "plugin:kuku-ai|ai_new_session":
          return { sessionId: "session-1" };
        case "agent_run_codex_chat":
          return { content: "Summary." };
        default:
          throw new Error(`unexpected invoke: ${command}`);
      }
    });
    mockReadVaultFileWithChecksum.mockResolvedValue({
      content: "# Base\ncontent",
      checksum: "checksum-1",
    });

    const chat = await loadChatStoreModule();
    await refreshCodexReadyProvider();

    await chat.createSession("agent");
    await chat.addFileAttachment({
      name: "Base",
      path: "notes/Base.md",
      folder: "notes",
    });
    await chat.sendMessage("summarize this");

    expect(mockReadVaultFileWithChecksum).toHaveBeenCalledWith("notes/Base.md");
    expect(chat.chatState.sessions["session-1"]?.fileAttachments).toEqual([]);
    expect(chat.chatState.sessions["session-1"]?.messages).toMatchObject([
      {
        kind: "text",
        role: "user",
        content: "summarize this",
        attachments: [
          {
            kind: "file",
            path: "notes/Base.md",
            name: "Base",
            sizeBytes: 14,
          },
        ],
      },
      {
        kind: "text",
        role: "assistant",
        content: "Summary.",
      },
    ]);
    expect(mockInvoke).toHaveBeenCalledWith("agent_run_codex_chat", {
      request: {
        content: "summarize this",
        mode: "agent",
        codexConfig: {
          sandbox: "read-only",
        },
        editorContext: {
          activeFile: null,
          selectedText: null,
          openTabs: [],
          cursorLine: null,
          embeddedFiles: [
            {
              path: "notes/Base.md",
              content: "# Base\ncontent",
              checksum: "checksum-1",
              sizeBytes: 14,
            },
          ],
        },
      },
    });
    expect(mockInvoke).not.toHaveBeenCalledWith("plugin:kuku-ai|ai_send_message", expect.anything());
  });

  it("sends selected text as visible turn context by default", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "agent_check_codex_readiness":
          return codexReadyResponse();
        case "agent_get_openai_api_key_status":
          return { configured: false };
        case "plugin:kuku-ai|ai_new_session":
          return { sessionId: "session-1" };
        case "agent_run_codex_chat":
          return { content: "Explained." };
        default:
          throw new Error(`unexpected invoke: ${command}`);
      }
    });
    mockContextSnapshot.mockImplementation(() => ({
      activeFile: "notes/Base.md",
      selectedText: "selected paragraph",
      openTabs: [],
      cursorLine: null,
    }));

    const chat = await loadChatStoreModule();
    await refreshCodexReadyProvider();

    await chat.createSession("ask");
    await chat.sendMessage("explain this");

    expect(chat.chatState.sessions["session-1"]?.messages).toMatchObject([
      {
        kind: "text",
        role: "user",
        content: "explain this",
        attachments: [
          {
            kind: "selection",
            activeFile: "notes/Base.md",
            sizeBytes: 18,
          },
        ],
      },
      {
        kind: "text",
        role: "assistant",
        content: "Explained.",
      },
    ]);
    expect(mockInvoke).toHaveBeenCalledWith("agent_run_codex_chat", {
      request: {
        content: "explain this",
        mode: "ask",
        codexConfig: {
          sandbox: "read-only",
        },
        editorContext: {
          activeFile: "notes/Base.md",
          selectedText: "selected paragraph",
          openTabs: [],
          cursorLine: null,
          embeddedFiles: [],
        },
      },
    });
    expect(mockInvoke).not.toHaveBeenCalledWith("plugin:kuku-ai|ai_send_message", expect.anything());
  });

  it("can disable selected text context for precomposed prompts", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "agent_check_codex_readiness":
          return codexReadyResponse();
        case "agent_get_openai_api_key_status":
          return { configured: false };
        case "plugin:kuku-ai|ai_new_session":
          return { sessionId: "session-1" };
        case "agent_run_codex_chat":
          return { content: "Done." };
        default:
          throw new Error(`unexpected invoke: ${command}`);
      }
    });
    mockContextSnapshot.mockImplementation(() => ({
      activeFile: "notes/Base.md",
      selectedText: "selected paragraph",
      openTabs: [],
      cursorLine: null,
    }));

    const chat = await loadChatStoreModule();
    await refreshCodexReadyProvider();

    await chat.createSession("ask");
    await chat.sendMessage("prompt already contains selection", { includeSelectedText: false });

    expect(chat.chatState.sessions["session-1"]?.messages).toMatchObject([
      {
        kind: "text",
        role: "user",
        content: "prompt already contains selection",
      },
      {
        kind: "text",
        role: "assistant",
        content: "Done.",
      },
    ]);
    expect(chat.chatState.sessions["session-1"]?.messages[0]).not.toHaveProperty("attachments");
    expect(mockInvoke).toHaveBeenCalledWith("agent_run_codex_chat", {
      request: {
        content: "prompt already contains selection",
        mode: "ask",
        codexConfig: {
          sandbox: "read-only",
        },
        editorContext: {
          activeFile: "notes/Base.md",
          selectedText: null,
          openTabs: [],
          cursorLine: null,
          embeddedFiles: [],
        },
      },
    });
    expect(mockInvoke).not.toHaveBeenCalledWith("plugin:kuku-ai|ai_send_message", expect.anything());
  });

  it("lets the next selected mode change while the active session is busy", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "plugin:kuku-ai|ai_new_session":
          return { sessionId: "session-1" };
        default:
          throw new Error(`unexpected invoke: ${command}`);
      }
    });

    const chat = await loadChatStoreModule();

    await chat.createSession("ask");
    chat.setSessionStatus("session-1", "streaming");
    await chat.switchMode("agent");

    expect(chat.chatState.selectedMode).toBe("agent");
    expect(chat.chatState.sessions["session-1"]?.mode).toBe("agent");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});
