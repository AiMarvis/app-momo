import type {
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

function createDefaultAiConfig(): AiConfig {
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

function normalizeAiConfig(raw: unknown): AiConfig {
  const defaults = createDefaultAiConfig();
  if (!isRecord(raw)) return defaults;

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

export {
  AI_CHAT_SETTINGS_PLUGIN_ID,
  AI_CHAT_SECURE_KEYS,
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
  createDefaultAiConfig,
  createCodexConfigFromAiConfig,
  normalizeAiConfig,
  normalizeChatMode,
  normalizeCodexApprovalPolicy,
  normalizeCodexSandbox,
};
