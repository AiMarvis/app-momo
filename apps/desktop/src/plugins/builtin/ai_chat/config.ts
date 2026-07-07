import type {
  AgentApiChatConfig,
  AgentApiProviderId,
  AiConfig,
  ChatMode,
  CodexApprovalPolicy,
  CodexChatConfig,
  CodexSandboxMode,
} from "./types";

const AI_CHAT_SETTINGS_PLUGIN_ID = "ai-chat";
const AI_CHAT_SECURE_KEYS = ["apiKey"] as const;
const LEGACY_MODEL_ALIASES = new Set(["gemini-3.1-flash-lite-preview"]);
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_PROVIDER = "remote" as const;
const DEFAULT_CHAT_MODE: ChatMode = "ask";
const DEFAULT_CODEX_MODEL = "";
const DEFAULT_CODEX_SANDBOX: CodexSandboxMode = "read-only";
const DEFAULT_CODEX_APPROVAL_POLICY: CodexApprovalPolicy = "default";
const DEFAULT_CODEX_WEB_SEARCH = false;
const DEFAULT_SERVER_URL =
  import.meta.env.VITE_KUKU_API_URL?.trim() ||
  (import.meta.env.PROD ? "https://api.kuku.mom" : "http://localhost:8080");
// Internal guardrails: these are intentionally kept out of the settings UI.
const DEFAULT_ROUND_LIMIT = 12;
const DEFAULT_PROXY_TIMEOUT_MS = 15_000;
const DEFAULT_AGENT_API_PROVIDER: AgentApiProviderId = "codex_cli";
const AGENT_API_PROVIDER_PRESETS = [
  {
    id: "codex_cli",
    name: "Codex CLI",
    baseUrl: "",
    model: "",
    apiKeyRequired: false,
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    model: "nvidia/nemotron-3-ultra-550b-a55b",
    apiKeyRequired: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.1",
    apiKeyRequired: true,
  },
  {
    id: "xai",
    name: "xAI Grok",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-4",
    apiKeyRequired: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    apiKeyRequired: true,
  },
  {
    id: "lm_studio",
    name: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    model: "local-model",
    apiKeyRequired: false,
  },
  {
    id: "custom",
    name: "Custom OpenAI-compatible",
    baseUrl: "https://",
    model: "",
    apiKeyRequired: true,
  },
] as const satisfies readonly AgentApiProviderPreset[];

interface AgentApiProviderPreset {
  readonly id: AgentApiProviderId;
  readonly name: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKeyRequired: boolean;
}

function createDefaultAiConfig(): AiConfig {
  const agentPreset = agentApiProviderPreset(DEFAULT_AGENT_API_PROVIDER);
  return {
    provider: DEFAULT_PROVIDER,
    apiKey: null,
    model: DEFAULT_MODEL,
    serverUrl: DEFAULT_SERVER_URL,
    defaultMode: DEFAULT_CHAT_MODE,
    codexModel: DEFAULT_CODEX_MODEL,
    codexSandbox: DEFAULT_CODEX_SANDBOX,
    codexApprovalPolicy: DEFAULT_CODEX_APPROVAL_POLICY,
    codexWebSearch: DEFAULT_CODEX_WEB_SEARCH,
    agentApiProvider: DEFAULT_AGENT_API_PROVIDER,
    agentApiBaseUrl: agentPreset.baseUrl,
    agentApiModel: agentPreset.model,
    agentApiName: agentPreset.name,
    roundLimit: DEFAULT_ROUND_LIMIT,
    proxyToolTimeoutMs: DEFAULT_PROXY_TIMEOUT_MS,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAiModel(model: string): string {
  const trimmed = model.trim();
  return LEGACY_MODEL_ALIASES.has(trimmed) ? DEFAULT_MODEL : trimmed;
}

function normalizeChatMode(value: unknown): ChatMode {
  switch (value) {
    case "agent":
    case "ask":
    case "inline":
      return value;
    default:
      return DEFAULT_CHAT_MODE;
  }
}

function normalizeCodexSandbox(value: unknown): CodexSandboxMode {
  switch (value) {
    case "read-only":
    case "workspace-write":
    case "danger-full-access":
      return value;
    default:
      return DEFAULT_CODEX_SANDBOX;
  }
}

function normalizeCodexApprovalPolicy(value: unknown): CodexApprovalPolicy {
  switch (value) {
    case "default":
    case "untrusted":
    case "on-request":
    case "never":
      return value;
    default:
      return DEFAULT_CODEX_APPROVAL_POLICY;
  }
}

function normalizeAgentApiProvider(value: unknown): AgentApiProviderId {
  switch (value) {
    case "codex_cli":
    case "custom":
    case "deepseek":
    case "lm_studio":
    case "nvidia":
    case "openai":
    case "xai":
      return value;
    default:
      return DEFAULT_AGENT_API_PROVIDER;
  }
}

function normalizeAiConfig(raw: unknown): AiConfig {
  const defaults = createDefaultAiConfig();
  if (!isRecord(raw)) return defaults;
  const agentApiProvider = normalizeAgentApiProvider(raw.agentApiProvider);
  const agentApiPreset = agentApiProviderPreset(agentApiProvider);

  return {
    provider:
      raw.provider === "gemini" || raw.provider === "remote" ? raw.provider : defaults.provider,
    apiKey: typeof raw.apiKey === "string" && raw.apiKey.trim().length > 0 ? raw.apiKey : null,
    model:
      typeof raw.model === "string" && raw.model.trim().length > 0
        ? normalizeAiModel(raw.model)
        : defaults.model,
    serverUrl:
      typeof raw.serverUrl === "string" && raw.serverUrl.trim().length > 0
        ? raw.serverUrl
        : defaults.serverUrl,
    defaultMode: normalizeChatMode(raw.defaultMode),
    codexModel: typeof raw.codexModel === "string" ? raw.codexModel.trim() : defaults.codexModel,
    codexSandbox: normalizeCodexSandbox(raw.codexSandbox),
    codexApprovalPolicy: defaults.codexApprovalPolicy,
    codexWebSearch: defaults.codexWebSearch,
    agentApiProvider,
    agentApiBaseUrl:
      typeof raw.agentApiBaseUrl === "string" && raw.agentApiBaseUrl.trim().length > 0
        ? raw.agentApiBaseUrl.trim()
        : agentApiPreset.baseUrl,
    agentApiModel:
      typeof raw.agentApiModel === "string" && raw.agentApiModel.trim().length > 0
        ? raw.agentApiModel.trim()
        : agentApiPreset.model,
    agentApiName:
      typeof raw.agentApiName === "string" && raw.agentApiName.trim().length > 0
        ? raw.agentApiName.trim()
        : agentApiPreset.name,
    roundLimit:
      typeof raw.roundLimit === "number" && Number.isFinite(raw.roundLimit) && raw.roundLimit > 0
        ? raw.roundLimit
        : defaults.roundLimit,
    proxyToolTimeoutMs:
      typeof raw.proxyToolTimeoutMs === "number" &&
      Number.isFinite(raw.proxyToolTimeoutMs) &&
      raw.proxyToolTimeoutMs > 0
        ? raw.proxyToolTimeoutMs
        : defaults.proxyToolTimeoutMs,
  };
}

function createCodexConfigFromAiConfig(
  config: Pick<AiConfig, "codexModel" | "codexSandbox">,
): CodexChatConfig {
  const model = config.codexModel?.trim() ?? "";
  return {
    ...(model === "" ? {} : { model }),
    sandbox: normalizeCodexSandbox(config.codexSandbox),
  };
}

function agentApiProviderPreset(provider: AgentApiProviderId): AgentApiProviderPreset {
  for (const preset of AGENT_API_PROVIDER_PRESETS) {
    if (preset.id === provider) return preset;
  }
  return {
    id: "codex_cli",
    name: "Codex CLI",
    baseUrl: "",
    model: "",
    apiKeyRequired: false,
  };
}

function createAgentApiConfigFromAiConfig(
  config: Pick<AiConfig, "agentApiBaseUrl" | "agentApiModel" | "agentApiName" | "agentApiProvider">,
): AgentApiChatConfig {
  const providerId = normalizeAgentApiProvider(config.agentApiProvider);
  const preset = agentApiProviderPreset(providerId);
  return {
    providerId,
    providerName: config.agentApiName?.trim() || preset.name,
    baseUrl: config.agentApiBaseUrl?.trim() || preset.baseUrl,
    model: config.agentApiModel?.trim() || preset.model,
  };
}

function agentApiProviderNeedsKey(provider: AgentApiProviderId): boolean {
  return agentApiProviderPreset(provider).apiKeyRequired;
}

export {
  AGENT_API_PROVIDER_PRESETS,
  AI_CHAT_SETTINGS_PLUGIN_ID,
  AI_CHAT_SECURE_KEYS,
  DEFAULT_AGENT_API_PROVIDER,
  DEFAULT_CHAT_MODE,
  DEFAULT_CODEX_APPROVAL_POLICY,
  DEFAULT_CODEX_MODEL,
  DEFAULT_CODEX_SANDBOX,
  DEFAULT_CODEX_WEB_SEARCH,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  DEFAULT_PROXY_TIMEOUT_MS,
  DEFAULT_ROUND_LIMIT,
  DEFAULT_SERVER_URL,
  agentApiProviderNeedsKey,
  agentApiProviderPreset,
  createAgentApiConfigFromAiConfig,
  createDefaultAiConfig,
  createCodexConfigFromAiConfig,
  normalizeAiConfig,
  normalizeAgentApiProvider,
  normalizeChatMode,
  normalizeCodexApprovalPolicy,
  normalizeCodexSandbox,
};
