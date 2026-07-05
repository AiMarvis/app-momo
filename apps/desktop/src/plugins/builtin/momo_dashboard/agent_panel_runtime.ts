import { invoke } from "@tauri-apps/api/core";

import type {
  CodexPlanAdapter,
  OpenAiPlanAdapter,
  ProviderAdapterOutput,
  ProviderPlanRequest,
} from "~/lib/momo/agent_provider_adapters";
import {
  organizeSelectedInboxNotes,
  type OrganizeInboxResult,
  type OrganizeInboxVault,
} from "~/lib/momo/organize_inbox_runtime";
import { listDirectory, vaultMkdir } from "~/lib/vault_fs";
import { exists, readFileWithChecksum, writeFile, writeFileWithChecksum } from "~/stores/vault";

import { agentRunCopyForResult, type AgentRunState } from "./agent_panel_cards";
import {
  AI_CHAT_SECURE_KEYS,
  AI_CHAT_SETTINGS_PLUGIN_ID,
  createCodexConfigFromAiConfig,
  createDefaultAiConfig,
  normalizeAiConfig,
} from "../ai_chat/config";
import type { AiConfig, CodexChatConfig } from "../ai_chat/types";
import { loadPluginSettings } from "~/plugins/settings_store";

type OrganizeInboxAction = (sourceNote: string) => Promise<OrganizeInboxResult>;

interface CodexReadiness {
  readonly ready: boolean;
}

interface MomoAgentPanelProps {
  readonly organizeInbox?: OrganizeInboxAction;
}

interface RunOrganizeForPanelInput {
  readonly sourceNote: string;
  readonly organizeInbox: OrganizeInboxAction;
  readonly rootPath: string | null;
  readonly reloadVault: (rootPath: string) => Promise<unknown>;
  readonly refetchAgentState: () => Promise<void> | void;
  readonly setRunState: (state: AgentRunState) => void;
}

const appOrganizeVault: OrganizeInboxVault = {
  exists,
  listDirectory,
  mkdir: vaultMkdir,
  readFileWithChecksum,
  writeFile,
  writeFileWithChecksum,
};

const appCodexAdapter: CodexPlanAdapter = {
  ready: async () => {
    const readiness = await invoke<CodexReadiness>("agent_check_codex_readiness");
    return readiness.ready;
  },
  createPlan: async (request) => {
    const codexConfig = await loadCodexProviderSettings();
    return invoke<ProviderAdapterOutput>("agent_create_codex_plan", {
      request: {
        ...serializableProviderRequest(request),
        codexConfig,
      },
    });
  },
};

const appOpenAiAdapter: OpenAiPlanAdapter = {
  byokReady: async () => false,
  createPlan: async () => ({
    kind: "failed",
    reason: "OpenAI fallback is disabled",
  }),
};

async function defaultOrganizeInbox(sourceNote: string): Promise<OrganizeInboxResult> {
  return organizeSelectedInboxNotes({
    selectedPaths: [sourceNote],
    vault: appOrganizeVault,
    codex: appCodexAdapter,
    openai: appOpenAiAdapter,
    askOpenAiFallbackApproval: async () => false,
  });
}

async function loadCodexProviderSettings(): Promise<CodexChatConfig> {
  const config = await loadPluginSettings<AiConfig>({
    pluginId: AI_CHAT_SETTINGS_PLUGIN_ID,
    defaults: createDefaultAiConfig(),
    secureKeys: [...AI_CHAT_SECURE_KEYS],
    normalize: (raw) => normalizeAiConfig(raw),
  });
  return createCodexConfigFromAiConfig(config);
}

async function runOrganizeForPanel(input: RunOrganizeForPanelInput): Promise<void> {
  input.setRunState({ kind: "running" });
  try {
    const result = await input.organizeInbox(input.sourceNote);
    if (result.status === "applied") {
      input.setRunState({ kind: "applied", receipt: result.receipt });
      if (input.rootPath) await input.reloadVault(input.rootPath);
      await input.refetchAgentState();
      return;
    }
    const copy = agentRunCopyForResult(result);
    input.setRunState({ kind: "failed", title: copy.title, detail: copy.detail });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Organize Inbox failed";
    input.setRunState({ kind: "failed", title: "Run failed", detail });
  }
}

function serializableProviderRequest(request: ProviderPlanRequest): Omit<ProviderPlanRequest, "signal"> {
  return {
    sourceNote: request.sourceNote,
    ...(request.sourceMarkdown === undefined ? {} : { sourceMarkdown: request.sourceMarkdown }),
    relatedOutputs: request.relatedOutputs ?? [],
  };
}

export { defaultOrganizeInbox, runOrganizeForPanel };
export type { MomoAgentPanelProps, OrganizeInboxAction, RunOrganizeForPanelInput };
