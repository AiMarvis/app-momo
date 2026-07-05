import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createStore } from "solid-js/store";

type CodexReadinessStatus = "ready" | "codex_cli_not_found" | "login_required" | "check_timed_out";
type AgentProviderStatus = "codex_cli" | "setup_required";

interface CodexReadiness {
  readonly provider: "codex_cli";
  readonly status: CodexReadinessStatus;
  readonly ready: boolean;
  readonly checkName: "codex login status";
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly checkedAtMs: number;
}

interface OpenAiApiKeyStatus {
  readonly configured: boolean;
}

interface CodexReadinessView extends CodexReadiness {
  readonly userFacingStatus: "Ready" | "Codex CLI not found" | "Login required" | "Check timed out";
}

interface AgentProviderState {
  loading: boolean;
  error: string | null;
  codex: CodexReadinessView;
  openai: OpenAiApiKeyStatus;
  providerStatus: AgentProviderStatus;
  manualWorkAvailable: boolean;
  continuedWithoutAgent: boolean;
}

interface ExistingAiChatGate {
  readonly apiKeyMissing: boolean;
  readonly remoteLoginRequired: boolean;
}

const CODEX_SETUP_URL = "https://developers.openai.com/codex/cli";

const DEFAULT_CODEX_READINESS: CodexReadinessView = {
  provider: "codex_cli",
  status: "codex_cli_not_found",
  ready: false,
  checkName: "codex login status",
  exitCode: null,
  timedOut: false,
  checkedAtMs: 0,
  userFacingStatus: "Codex CLI not found",
};

const [agentProviderState, setAgentProviderState] = createStore<AgentProviderState>({
  loading: false,
  error: null,
  codex: DEFAULT_CODEX_READINESS,
  openai: { configured: false },
  providerStatus: "setup_required",
  manualWorkAvailable: true,
  continuedWithoutAgent: false,
});

function assertNeverStatus(status: never): never {
  void status;
  throw new Error("Unhandled Codex readiness status");
}

function userFacingCodexStatus(
  status: CodexReadinessStatus,
): CodexReadinessView["userFacingStatus"] {
  switch (status) {
    case "ready":
      return "Ready";
    case "codex_cli_not_found":
      return "Codex CLI not found";
    case "login_required":
      return "Login required";
    case "check_timed_out":
      return "Check timed out";
    default:
      return assertNeverStatus(status);
  }
}

function withUserFacingStatus(readiness: CodexReadiness): CodexReadinessView {
  return {
    ...readiness,
    userFacingStatus: userFacingCodexStatus(readiness.status),
  };
}

function resolveProviderStatus(
  codex: CodexReadinessView,
  _openai: OpenAiApiKeyStatus,
): AgentProviderStatus {
  if (codex.ready) return "codex_cli";
  return "setup_required";
}

async function refreshAgentProviderStatus(): Promise<void> {
  setAgentProviderState("loading", true);
  setAgentProviderState("error", null);
  try {
    const [codexRaw, openai] = await Promise.all([
      invoke<CodexReadiness>("agent_check_codex_readiness"),
      invoke<OpenAiApiKeyStatus>("agent_get_openai_api_key_status"),
    ]);
    const codex = withUserFacingStatus(codexRaw);
    setAgentProviderState({
      loading: false,
      error: null,
      codex,
      openai,
      providerStatus: resolveProviderStatus(codex, openai),
      manualWorkAvailable: true,
      continuedWithoutAgent: agentProviderState.continuedWithoutAgent,
    });
  } catch (error) {
    setAgentProviderState("loading", false);
    setAgentProviderState("error", error instanceof Error ? error.message : String(error));
  }
}

async function saveOpenAiApiKey(apiKey: string): Promise<void> {
  const openai = await invoke<OpenAiApiKeyStatus>("agent_set_openai_api_key", { apiKey });
  setAgentProviderState("openai", openai);
  setAgentProviderState("providerStatus", resolveProviderStatus(agentProviderState.codex, openai));
}

async function clearOpenAiApiKey(): Promise<void> {
  const openai = await invoke<OpenAiApiKeyStatus>("agent_clear_openai_api_key");
  setAgentProviderState("openai", openai);
  setAgentProviderState("providerStatus", resolveProviderStatus(agentProviderState.codex, openai));
}

function continueWithoutAgent(): void {
  setAgentProviderState("continuedWithoutAgent", true);
}

function shouldRenderExistingAiChatSurface(gate: ExistingAiChatGate): boolean {
  void gate;
  return agentProviderState.providerStatus === "codex_cli";
}

function shouldShowAgentSetupPrompt(state: AgentProviderState = agentProviderState): boolean {
  return state.providerStatus === "setup_required" && !state.continuedWithoutAgent;
}

function agentActionsBecomeSetupCtas(): boolean {
  return agentProviderState.providerStatus === "setup_required";
}

async function openCodexSetup(): Promise<void> {
  await openUrl(CODEX_SETUP_URL);
}

function buildCodexDiagnostic(readiness: CodexReadiness): string {
  const safeStatus = userFacingCodexStatus(readiness.status);
  const exitCode = readiness.exitCode === null ? "none" : String(readiness.exitCode);
  const timestamp = new Date(readiness.checkedAtMs || Date.now()).toISOString();
  const macosVersion = navigator.platform || "macOS";
  return [
    "Momo Codex readiness diagnostic",
    `app_version=${import.meta.env.VITE_APP_VERSION ?? "0.0.0"}`,
    `macos_version=${macosVersion}`,
    `provider_status=${readiness.provider}`,
    `readiness_status=${safeStatus}`,
    `check_name=${readiness.checkName}`,
    `exit_code=${exitCode}`,
    `timed_out=${readiness.timedOut ? "true" : "false"}`,
    `timestamp=${timestamp}`,
  ].join("\n");
}

async function copyCodexDiagnostic(
  readiness: CodexReadiness = agentProviderState.codex,
): Promise<void> {
  await navigator.clipboard.writeText(buildCodexDiagnostic(readiness));
}

export {
  agentActionsBecomeSetupCtas,
  agentProviderState,
  buildCodexDiagnostic,
  clearOpenAiApiKey,
  continueWithoutAgent,
  copyCodexDiagnostic,
  openCodexSetup,
  refreshAgentProviderStatus,
  saveOpenAiApiKey,
  shouldRenderExistingAiChatSurface,
  shouldShowAgentSetupPrompt,
};
export type {
  AgentProviderStatus,
  CodexReadiness,
  CodexReadinessStatus,
  ExistingAiChatGate,
  OpenAiApiKeyStatus,
};
