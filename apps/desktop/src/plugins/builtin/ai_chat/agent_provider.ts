import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createStore } from "solid-js/store";

import { agentApiProviderNeedsKey } from "./config";
import type { AgentApiChatConfig } from "./types";

type CodexReadinessStatus = "ready" | "codex_cli_not_found" | "login_required" | "check_timed_out";
type AgentProviderStatus = "api_provider" | "codex_cli" | "setup_required";

interface CodexReadiness {
  readonly provider: "codex_cli";
  readonly status: CodexReadinessStatus;
  readonly ready: boolean;
  readonly checkName: "codex login status";
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly checkedAtMs: number;
}

interface AgentApiKeyStatus {
  readonly configured: boolean;
}

interface CodexReadinessView extends CodexReadiness {
  readonly userFacingStatus: "Ready" | "Codex CLI not found" | "Login required" | "Check timed out";
}

interface AgentProviderState {
  loading: boolean;
  error: string | null;
  codex: CodexReadinessView;
  openai: AgentApiKeyStatus;
  providerStatus: AgentProviderStatus;
  manualWorkAvailable: boolean;
  continuedWithoutAgent: boolean;
}

interface ExistingAiChatGate {
  readonly apiKeyMissing: boolean;
  readonly agentApiKeyMissing: boolean;
  readonly remoteLoginRequired: boolean;
  readonly selectedAgentProvider: "api_provider" | "codex_cli";
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
  agentApiReady: boolean,
): AgentProviderStatus {
  if (codex.ready) return "codex_cli";
  if (agentApiReady) return "api_provider";
  return "setup_required";
}

function agentApiReady(apiConfig: AgentApiChatConfig | undefined, status: AgentApiKeyStatus): boolean {
  if (!apiConfig || apiConfig.providerId === "codex_cli") return false;
  if (!agentApiProviderNeedsKey(apiConfig.providerId)) return true;
  return status.configured;
}

async function readAgentApiKeyStatus(
  apiConfig: AgentApiChatConfig | undefined,
): Promise<AgentApiKeyStatus> {
  if (!apiConfig || apiConfig.providerId === "codex_cli") return { configured: false };
  if (!agentApiProviderNeedsKey(apiConfig.providerId)) return { configured: false };
  return invoke<AgentApiKeyStatus>("agent_get_agent_api_key_status", { apiConfig });
}

async function refreshAgentProviderStatus(apiConfig?: AgentApiChatConfig): Promise<void> {
  setAgentProviderState("loading", true);
  setAgentProviderState("error", null);
  try {
    const [codexRaw, openai] = await Promise.all([
      invoke<CodexReadiness>("agent_check_codex_readiness"),
      readAgentApiKeyStatus(apiConfig),
    ]);
    const codex = withUserFacingStatus(codexRaw);
    const apiReady = agentApiReady(apiConfig, openai);
    setAgentProviderState({
      loading: false,
      error: null,
      codex,
      openai,
      providerStatus: resolveProviderStatus(codex, apiReady),
      manualWorkAvailable: true,
      continuedWithoutAgent: agentProviderState.continuedWithoutAgent,
    });
  } catch (error) {
    setAgentProviderState("loading", false);
    setAgentProviderState("error", error instanceof Error ? error.message : String(error));
  }
}

async function saveAgentApiKey(apiKey: string, apiConfig: AgentApiChatConfig): Promise<void> {
  const openai = await invoke<AgentApiKeyStatus>("agent_set_agent_api_key", { apiConfig, apiKey });
  setAgentProviderState("openai", openai);
  setAgentProviderState(
    "providerStatus",
    resolveProviderStatus(agentProviderState.codex, agentApiReady(apiConfig, openai)),
  );
}

async function clearAgentApiKey(apiConfig: AgentApiChatConfig): Promise<void> {
  const openai = await invoke<AgentApiKeyStatus>("agent_clear_agent_api_key", { apiConfig });
  setAgentProviderState("openai", openai);
  setAgentProviderState(
    "providerStatus",
    resolveProviderStatus(agentProviderState.codex, agentApiReady(apiConfig, openai)),
  );
}

function continueWithoutAgent(): void {
  setAgentProviderState("continuedWithoutAgent", true);
}

function shouldRenderExistingAiChatSurface(gate: ExistingAiChatGate): boolean {
  if (gate.selectedAgentProvider === "codex_cli") {
    return agentProviderState.codex.ready;
  }
  return !gate.agentApiKeyMissing;
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
  clearAgentApiKey,
  continueWithoutAgent,
  copyCodexDiagnostic,
  openCodexSetup,
  refreshAgentProviderStatus,
  saveAgentApiKey,
  shouldRenderExistingAiChatSurface,
  shouldShowAgentSetupPrompt,
};
export type {
  AgentProviderStatus,
  CodexReadiness,
  CodexReadinessStatus,
  ExistingAiChatGate,
  AgentApiKeyStatus,
};
