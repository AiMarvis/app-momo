import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();
const mockClipboardWriteText = vi.fn();
const mockOpenUrl = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: mockOpenUrl,
}));

async function loadAgentProviderModule() {
  vi.resetModules();
  return import("./agent_provider");
}

describe("ai_chat agent_provider", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockClipboardWriteText.mockReset();
    mockOpenUrl.mockReset();
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mockClipboardWriteText },
    });
  });

  it("maps missing Codex to setup required without blocking manual app use", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "agent_check_codex_readiness") {
        return {
          provider: "codex_cli",
          status: "codex_cli_not_found",
          ready: false,
          checkName: "codex login status",
          exitCode: null,
          timedOut: false,
          checkedAtMs: 1,
        };
      }
      if (command === "agent_get_openai_api_key_status") return { configured: false };
      throw new Error(`unexpected invoke: ${command}`);
    });

    const agent = await loadAgentProviderModule();

    await agent.refreshAgentProviderStatus();

    expect(agent.agentProviderState.codex.userFacingStatus).toBe("Codex CLI not found");
    expect(agent.agentProviderState.providerStatus).toBe("setup_required");
    expect(agent.agentProviderState.manualWorkAvailable).toBe(true);
    expect(agent.agentActionsBecomeSetupCtas()).toBe(true);
  });

  it("keeps AI chat unavailable when Codex setup is required", async () => {
    const agent = await loadAgentProviderModule();

    expect(agent.agentProviderState.providerStatus).toBe("setup_required");
    expect(
      agent.shouldRenderExistingAiChatSurface({
        apiKeyMissing: false,
        remoteLoginRequired: false,
      }),
    ).toBe(false);
    expect(
      agent.shouldRenderExistingAiChatSurface({
        apiKeyMissing: true,
        remoteLoginRequired: false,
      }),
    ).toBe(false);
  });

  it("does not promote OpenAI BYOK to the active chat provider", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "agent_check_codex_readiness") {
        return {
          provider: "codex_cli",
          status: "codex_cli_not_found",
          ready: false,
          checkName: "codex login status",
          exitCode: null,
          timedOut: false,
          checkedAtMs: 1,
        };
      }
      if (command === "agent_get_openai_api_key_status") return { configured: true };
      throw new Error(`unexpected invoke: ${command}`);
    });

    const agent = await loadAgentProviderModule();

    await agent.refreshAgentProviderStatus();

    expect(agent.agentProviderState.openai.configured).toBe(true);
    expect(agent.agentProviderState.providerStatus).toBe("setup_required");
  });

  it("keeps AI chat available with Codex ready even when legacy providers are missing", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "agent_check_codex_readiness") {
        return {
          provider: "codex_cli",
          status: "ready",
          ready: true,
          checkName: "codex login status",
          exitCode: 0,
          timedOut: false,
          checkedAtMs: 5,
        };
      }
      if (command === "agent_get_openai_api_key_status") return { configured: false };
      throw new Error(`unexpected invoke: ${command}`);
    });

    const agent = await loadAgentProviderModule();

    await agent.refreshAgentProviderStatus();

    expect(agent.agentProviderState.providerStatus).toBe("codex_cli");
    expect(
      agent.shouldRenderExistingAiChatSurface({
        apiKeyMissing: true,
        remoteLoginRequired: false,
      }),
    ).toBe(true);
  });

  it("dismisses the agent setup prompt without enabling unavailable agent actions", async () => {
    const agent = await loadAgentProviderModule();

    expect(agent.agentProviderState.providerStatus).toBe("setup_required");
    expect(agent.shouldShowAgentSetupPrompt()).toBe(true);

    agent.continueWithoutAgent();

    expect(agent.agentProviderState.continuedWithoutAgent).toBe(true);
    expect(agent.shouldShowAgentSetupPrompt()).toBe(false);
    expect(agent.agentActionsBecomeSetupCtas()).toBe(true);
  });

  it("maps logged-out Codex to Login required", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "agent_check_codex_readiness") {
        return {
          provider: "codex_cli",
          status: "login_required",
          ready: false,
          checkName: "codex login status",
          exitCode: 1,
          timedOut: false,
          checkedAtMs: 2,
        };
      }
      if (command === "agent_get_openai_api_key_status") return { configured: false };
      throw new Error(`unexpected invoke: ${command}`);
    });

    const agent = await loadAgentProviderModule();

    await agent.refreshAgentProviderStatus();

    expect(agent.agentProviderState.codex.userFacingStatus).toBe("Login required");
  });

  it("maps timed-out Codex to Check timed out", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "agent_check_codex_readiness") {
        return {
          provider: "codex_cli",
          status: "check_timed_out",
          ready: false,
          checkName: "codex login status",
          exitCode: null,
          timedOut: true,
          checkedAtMs: 3,
        };
      }
      if (command === "agent_get_openai_api_key_status") return { configured: false };
      throw new Error(`unexpected invoke: ${command}`);
    });

    const agent = await loadAgentProviderModule();

    await agent.refreshAgentProviderStatus();

    expect(agent.agentProviderState.codex.userFacingStatus).toBe("Check timed out");
  });

  it("copies only safe diagnostic metadata", async () => {
    const agent = await loadAgentProviderModule();

    await agent.copyCodexDiagnostic({
      provider: "codex_cli",
      status: "login_required",
      ready: false,
      checkName: "codex login status",
      exitCode: 1,
      timedOut: false,
      checkedAtMs: 4,
    });

    const copied = String(mockClipboardWriteText.mock.calls[0]?.[0] ?? "");
    expect(copied).toContain("provider_status=codex_cli");
    expect(copied).toContain("readiness_status=Login required");
    expect(copied).toContain("check_name=codex login status");
    expect(copied).toContain("exit_code=1");
    expect(copied).not.toMatch(/stdout|stderr|OPENAI_API_KEY|CODEX_HOME|HOME=|vault|Users|sk-/i);
  });

  it("stores OpenAI BYOK only through the secure Tauri boundary", async () => {
    mockInvoke.mockResolvedValue({ configured: true });
    localStorage.setItem("openaiApiKey", "task-5-local-storage-fixture");

    const agent = await loadAgentProviderModule();

    await agent.saveOpenAiApiKey("task-5-openai-key-fixture");

    expect(mockInvoke).toHaveBeenCalledWith("agent_set_openai_api_key", {
      apiKey: "task-5-openai-key-fixture",
    });
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "plugin_save_settings",
      expect.objectContaining({ settings: expect.stringContaining("task-5-openai-key-fixture") }),
    );
    expect(localStorage.getItem("openaiApiKey")).toBe("task-5-local-storage-fixture");
  });
});
