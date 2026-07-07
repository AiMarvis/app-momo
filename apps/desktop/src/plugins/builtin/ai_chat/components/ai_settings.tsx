import { Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js";

import {
  agentProviderState,
  clearAgentApiKey,
  copyCodexDiagnostic,
  openCodexSetup,
  refreshAgentProviderStatus,
  saveAgentApiKey,
} from "../agent_provider";
import { chatState, loadConfig, saveConfig } from "../chat_store";
import {
  AGENT_API_PROVIDER_PRESETS,
  agentApiProviderNeedsKey,
  agentApiProviderPreset,
  createAgentApiConfigFromAiConfig,
  normalizeAgentApiProvider,
  normalizeChatMode,
  normalizeCodexSandbox,
} from "../config";
import type { AgentApiProviderId, ChatMode, CodexSandboxMode } from "../types";
import { EyeIcon, EyeOffIcon } from "~/components/icons";
import {
  SettingsBanner,
  SettingsCard,
  SettingsFieldRow,
  SettingsInput,
  SettingsListRow,
  SettingsPanel,
  SettingsSelect,
  SettingsStatusBadge,
  SettingsToolbarAction,
} from "~/components/settings/settings_blocks";
import { useSettingsRefreshToken } from "~/components/settings/settings_refresh";
import { t } from "~/i18n";

function shortModelLabel(modelId: string): string {
  if (!modelId) return "—";
  if (modelId.includes("gemini-3.1-flash-lite")) return "Gemini 3.1 Flash Lite";
  if (modelId.includes("gemini-3.1-flash")) return "Gemini 3.1 Flash";
  if (modelId.includes("flash")) return "Gemini Flash";
  if (modelId.includes("pro")) return "Gemini Pro";
  return modelId;
}

function AiSettings(): JSX.Element {
  const [apiKey, setApiKey] = createSignal("");
  const [provider, setProvider] = createSignal<"gemini" | "remote">("gemini");
  const [model, setModel] = createSignal("");
  const [serverUrl, setServerUrl] = createSignal("");
  const [defaultMode, setDefaultMode] = createSignal<ChatMode>("ask");
  const [codexModel, setCodexModel] = createSignal("");
  const [codexSandbox, setCodexSandbox] = createSignal<CodexSandboxMode>("read-only");
  const [agentApiProvider, setAgentApiProvider] =
    createSignal<AgentApiProviderId>("codex_cli");
  const [agentApiBaseUrl, setAgentApiBaseUrl] = createSignal("");
  const [agentApiModel, setAgentApiModel] = createSignal("");
  const [agentApiName, setAgentApiName] = createSignal("");
  const [agentApiKey, setAgentApiKey] = createSignal("");
  const [showApiKey, setShowApiKey] = createSignal(false);
  const settingsRefreshToken = useSettingsRefreshToken();

  const currentAgentApiConfig = createMemo(() =>
    createAgentApiConfigFromAiConfig({
      agentApiProvider: agentApiProvider(),
      agentApiBaseUrl: agentApiBaseUrl(),
      agentApiModel: agentApiModel(),
      agentApiName: agentApiName(),
    }),
  );

  createEffect(
    on(
      settingsRefreshToken,
      () => {
        void loadConfig().then(() =>
          refreshAgentProviderStatus(createAgentApiConfigFromAiConfig(chatState.config)),
        );
      },
      { defer: false },
    ),
  );

  createEffect(() => {
    if (!chatState.config.loading && !chatState.config.saving) {
      setApiKey(chatState.config.apiKey);
      setProvider(chatState.config.provider);
      setModel(chatState.config.model);
      setServerUrl(chatState.config.serverUrl);
      setDefaultMode(chatState.config.defaultMode);
      setCodexModel(chatState.config.codexModel);
      setCodexSandbox(chatState.config.codexSandbox);
      setAgentApiProvider(chatState.config.agentApiProvider);
      setAgentApiBaseUrl(chatState.config.agentApiBaseUrl);
      setAgentApiModel(chatState.config.agentApiModel);
      setAgentApiName(chatState.config.agentApiName);
    }
  });

  const isUnsaved = createMemo(() => {
    if (chatState.config.loading) return false;
    return (
      provider() !== chatState.config.provider ||
      apiKey() !== chatState.config.apiKey ||
      serverUrl() !== chatState.config.serverUrl ||
      defaultMode() !== chatState.config.defaultMode ||
      codexModel().trim() !== chatState.config.codexModel ||
      codexSandbox() !== chatState.config.codexSandbox ||
      agentApiProvider() !== chatState.config.agentApiProvider ||
      agentApiBaseUrl().trim() !== chatState.config.agentApiBaseUrl ||
      agentApiModel().trim() !== chatState.config.agentApiModel ||
      agentApiName().trim() !== chatState.config.agentApiName
    );
  });

  const saveButtonLabel = createMemo(() => {
    if (chatState.config.saving) return t("settings.plugin.ai_chat.action.saving");
    if (isUnsaved()) return t("settings.plugin.ai_chat.action.save_required");
    return t("settings.plugin.ai_chat.action.save");
  });

  const selectedAgentApiReady = createMemo(() => {
    if (agentApiProvider() === "codex_cli") return false;
    if (!agentApiProviderNeedsKey(agentApiProvider())) return true;
    return agentProviderState.openai.configured;
  });

  const selectedAgentProviderReady = createMemo(() =>
    agentApiProvider() === "codex_cli" ? agentProviderState.codex.ready : selectedAgentApiReady(),
  );

  const providerStatusLabel = createMemo(() => {
    if (agentApiProvider() === "codex_cli") {
      return agentProviderState.codex.ready
        ? t("settings.plugin.ai_chat.agent_provider.codex_ready")
        : t("settings.plugin.ai_chat.agent_provider.setup_required");
    }
    return selectedAgentApiReady()
      ? t("settings.plugin.ai_chat.agent_provider.api_ready")
      : t("settings.plugin.ai_chat.agent_provider.setup_required");
  });

  function selectAgentApiProvider(value: string): void {
    const nextProvider = normalizeAgentApiProvider(value);
    const preset = agentApiProviderPreset(nextProvider);
    setAgentApiProvider(nextProvider);
    setAgentApiBaseUrl(preset.baseUrl);
    setAgentApiModel(preset.model);
    setAgentApiName(preset.name);
    setAgentApiKey("");
    void refreshAgentProviderStatus(
      createAgentApiConfigFromAiConfig({
        agentApiProvider: nextProvider,
        agentApiBaseUrl: preset.baseUrl,
        agentApiModel: preset.model,
        agentApiName: preset.name,
      }),
    );
  }

  return (
    <SettingsPanel
      title={t("settings.plugin.ai_chat.title")}
      description={t("settings.plugin.ai_chat.description")}
      action={
        <SettingsToolbarAction
          variant="primary"
          disabled={chatState.config.saving}
          class={isUnsaved() ? "ring-2 ring-warning/60 ring-offset-1 ring-offset-bg-primary" : ""}
          onClick={() =>
            void saveConfig({
              provider: provider(),
              apiKey: apiKey(),
              serverUrl: serverUrl(),
              defaultMode: defaultMode(),
              codexModel: codexModel(),
              codexSandbox: codexSandbox(),
              agentApiProvider: agentApiProvider(),
              agentApiBaseUrl: agentApiBaseUrl(),
              agentApiModel: agentApiModel(),
              agentApiName: agentApiName(),
            })
          }
        >
          {saveButtonLabel()}
        </SettingsToolbarAction>
      }
    >
      <Show when={isUnsaved()}>
        <SettingsBanner
          tone="warning"
          title={t("settings.plugin.ai_chat.unsaved.title")}
          description={t("settings.plugin.ai_chat.unsaved.description")}
        />
      </Show>

      <SettingsCard
        title={t("settings.plugin.ai_chat.agent_provider.title")}
        description={t("settings.plugin.ai_chat.agent_provider.description")}
        tone="subtle"
        anchor="agent-provider"
        action={
          <SettingsStatusBadge tone={selectedAgentProviderReady() ? "success" : "error"}>
            {providerStatusLabel()}
          </SettingsStatusBadge>
        }
      >
        <div class="space-y-3">
          <SettingsBanner
            tone="info"
            description={t("settings.plugin.ai_chat.agent_provider.project_os_hint")}
          />
          <SettingsFieldRow
            stacked
            label={t("settings.plugin.ai_chat.agent_api.provider.label")}
            description={t("settings.plugin.ai_chat.agent_api.provider.description")}
            control={
              <SettingsSelect
                options={AGENT_API_PROVIDER_PRESETS.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                value={agentApiProvider()}
                onChange={selectAgentApiProvider}
              />
            }
          />
          <Show when={agentApiProvider() === "codex_cli"}>
            <>
              <SettingsListRow
                title={t("settings.plugin.ai_chat.agent_provider.codex")}
                description={agentProviderState.codex.userFacingStatus}
                action={
                  <div class="flex flex-wrap justify-end gap-2">
                    <SettingsToolbarAction onClick={() => void openCodexSetup()}>
                      {t("settings.plugin.ai_chat.agent_provider.open_codex")}
                    </SettingsToolbarAction>
                    <SettingsToolbarAction
                      disabled={agentProviderState.loading}
                      onClick={() => void refreshAgentProviderStatus()}
                    >
                      {agentProviderState.loading
                        ? t("settings.plugin.ai_chat.agent_provider.checking")
                        : t("settings.plugin.ai_chat.agent_provider.check_again")}
                    </SettingsToolbarAction>
                    <SettingsToolbarAction onClick={() => void copyCodexDiagnostic()}>
                      {t("settings.plugin.ai_chat.agent_provider.copy_diagnostic")}
                    </SettingsToolbarAction>
                  </div>
                }
              />
              <div class="grid gap-2 @lg:grid-cols-2">
                <SettingsFieldRow
                  stacked
                  label={t("settings.plugin.ai_chat.codex_settings.default_mode.label")}
                  description={t("settings.plugin.ai_chat.codex_settings.default_mode.description")}
                  control={
                    <SettingsSelect
                      options={[
                        { value: "ask", label: t("chat.mode.ask.title") },
                        { value: "agent", label: t("chat.mode.agent.title") },
                        { value: "inline", label: t("chat.mode.inline.title") },
                      ]}
                      value={defaultMode()}
                      onChange={(value) => setDefaultMode(normalizeChatMode(value))}
                    />
                  }
                />
                <SettingsFieldRow
                  stacked
                  label={t("settings.plugin.ai_chat.codex_settings.model.label")}
                  description={t("settings.plugin.ai_chat.codex_settings.model.description")}
                  control={
                    <SettingsInput
                      type="text"
                      value={codexModel()}
                      placeholder={t("settings.plugin.ai_chat.codex_settings.model.placeholder")}
                      spellcheck={false}
                      onInput={(event) => setCodexModel(event.currentTarget.value)}
                    />
                  }
                />
                <SettingsFieldRow
                  stacked
                  label={t("settings.plugin.ai_chat.codex_settings.sandbox.label")}
                  description={t("settings.plugin.ai_chat.codex_settings.sandbox.description")}
                  control={
                    <SettingsSelect
                      options={[
                        {
                          value: "read-only",
                          label: t("settings.plugin.ai_chat.codex_settings.sandbox.read_only"),
                        },
                        {
                          value: "workspace-write",
                          label: t("settings.plugin.ai_chat.codex_settings.sandbox.workspace_write"),
                        },
                        {
                          value: "danger-full-access",
                          label: t(
                            "settings.plugin.ai_chat.codex_settings.sandbox.danger_full_access",
                          ),
                        },
                      ]}
                      value={codexSandbox()}
                      onChange={(value) => setCodexSandbox(normalizeCodexSandbox(value))}
                    />
                  }
                />
              </div>
            </>
          </Show>
          <Show when={agentApiProvider() !== "codex_cli"}>
            <SettingsBanner
              tone="warning"
              title={t("settings.plugin.ai_chat.agent_api.cost_title")}
              description={t("settings.plugin.ai_chat.agent_api.cost_description")}
            />
            <div class="grid gap-2 @lg:grid-cols-2">
              <SettingsFieldRow
                stacked
                label={t("settings.plugin.ai_chat.agent_api.base_url.label")}
                description={t("settings.plugin.ai_chat.agent_api.base_url.description")}
                control={
                  <SettingsInput
                    type="url"
                    value={agentApiBaseUrl()}
                    placeholder="https://api.example.com/v1"
                    readOnly={agentApiProvider() !== "custom" && agentApiProvider() !== "lm_studio"}
                    spellcheck={false}
                    onInput={(event) => setAgentApiBaseUrl(event.currentTarget.value)}
                  />
                }
              />
              <SettingsFieldRow
                stacked
                label={t("settings.plugin.ai_chat.agent_api.model.label")}
                description={t("settings.plugin.ai_chat.agent_api.model.description")}
                control={
                  <SettingsInput
                    type="text"
                    value={agentApiModel()}
                    placeholder={agentApiProviderPreset(agentApiProvider()).model}
                    spellcheck={false}
                    onInput={(event) => setAgentApiModel(event.currentTarget.value)}
                  />
                }
              />
            </div>
            <Show when={agentApiProviderNeedsKey(agentApiProvider())}>
              <SettingsFieldRow
                stacked
                label={t("settings.plugin.ai_chat.agent_api.key_label")}
                description={
                  agentProviderState.openai.configured
                    ? t("settings.plugin.ai_chat.agent_api.configured")
                    : t("settings.plugin.ai_chat.agent_api.not_configured")
                }
                control={
                  <div class="flex w-full max-w-md flex-col gap-2 @sm:flex-row">
                    <SettingsInput
                      class="@sm:min-w-0 @sm:flex-1"
                      type="password"
                      value={agentApiKey()}
                      placeholder={t("settings.plugin.ai_chat.agent_api.placeholder")}
                      autocomplete="off"
                      spellcheck={false}
                      onInput={(event) => setAgentApiKey(event.currentTarget.value)}
                    />
                    <SettingsToolbarAction
                      variant="primary"
                      class="min-w-16 shrink-0 whitespace-nowrap"
                      disabled={agentApiKey().trim() === ""}
                      onClick={() => {
                        void saveAgentApiKey(agentApiKey(), currentAgentApiConfig()).then(() =>
                          setAgentApiKey(""),
                        );
                      }}
                    >
                      {t("settings.plugin.ai_chat.agent_api.save")}
                    </SettingsToolbarAction>
                    <SettingsToolbarAction
                      class="min-w-14 shrink-0 whitespace-nowrap"
                      disabled={!agentProviderState.openai.configured}
                      onClick={() => void clearAgentApiKey(currentAgentApiConfig())}
                    >
                      {t("settings.plugin.ai_chat.agent_api.clear")}
                    </SettingsToolbarAction>
                  </div>
                }
              />
            </Show>
          </Show>
          <Show when={agentProviderState.error}>
            {(error) => <SettingsBanner tone="error" description={error()} />}
          </Show>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t("settings.plugin.ai_chat.chat_connection.title")}
        description={t("settings.plugin.ai_chat.chat_connection.description")}
        tone="subtle"
      >
        <details class="overflow-hidden rounded-sm border border-border/90 bg-bg-secondary/40">
          <summary class="cursor-pointer px-3 py-2.5 text-[0.8125rem] font-medium text-text-primary select-none">
            {t("settings.plugin.ai_chat.chat_connection.summary")}
          </summary>
          <div class="space-y-3 border-t border-border/60 p-3">
            <SettingsFieldRow
              label={t("settings.plugin.ai_chat.connection.label")}
              description={t("settings.plugin.ai_chat.connection.description")}
              control={
                <div class="w-full max-w-72">
                  <SettingsSelect
                    options={[
                      {
                        value: "remote",
                        label: t("settings.plugin.ai_chat.connection.option_remote"),
                      },
                      {
                        value: "gemini",
                        label: t("settings.plugin.ai_chat.connection.option_gemini"),
                      },
                    ]}
                    value={provider()}
                    onChange={(value) => setProvider(value as "gemini" | "remote")}
                  />
                </div>
              }
            />
            <Show when={provider() === "gemini"}>
              <SettingsFieldRow
                stacked
                label={t("settings.plugin.ai_chat.api_key.label")}
                description={t("settings.plugin.ai_chat.api_key.description")}
                control={
                  <div data-settings-anchor="api-key" class="w-full max-w-md space-y-1.5">
                    <div class="relative w-full">
                      <SettingsInput
                        type={showApiKey() ? "text" : "password"}
                        value={apiKey()}
                        placeholder={t("settings.plugin.ai_chat.api_key.placeholder")}
                        class="pr-9"
                        autocomplete="off"
                        spellcheck={false}
                        onInput={(event) => setApiKey(event.currentTarget.value)}
                      />
                      <button
                        type="button"
                        class="absolute inset-y-0 right-0 flex items-center px-2.5 text-text-muted transition-colors hover:text-text-primary"
                        onClick={() => setShowApiKey((prev) => !prev)}
                        tabIndex={-1}
                        title={
                          showApiKey()
                            ? t("settings.plugin.ai_chat.api_key.hide")
                            : t("settings.plugin.ai_chat.api_key.show")
                        }
                      >
                        <Show when={showApiKey()} fallback={<EyeIcon size={14} />}>
                          <EyeOffIcon size={14} />
                        </Show>
                      </button>
                    </div>
                    <Show when={isUnsaved() && apiKey().trim() !== ""}>
                      <p class="text-[0.6875rem] font-medium text-warning" role="status">
                        {t("settings.plugin.ai_chat.unsaved.inline_prefix")}{" "}
                        <span class="text-text-primary">
                          {t("settings.plugin.ai_chat.action.save")}
                        </span>{" "}
                        {t("settings.plugin.ai_chat.unsaved.inline_suffix")}
                      </p>
                    </Show>
                  </div>
                }
              />
            </Show>
            <SettingsFieldRow
              label={t("settings.plugin.ai_chat.model.label")}
              description={
                provider() === "gemini"
                  ? t("settings.plugin.ai_chat.model.gemini_description")
                  : t("settings.plugin.ai_chat.model.remote_description")
              }
              control={
                <div class="w-full max-w-sm">
                  <SettingsInput
                    type="text"
                    value={shortModelLabel(model())}
                    readOnly
                    class="text-text-secondary"
                  />
                </div>
              }
            />
            <Show when={chatState.config.error}>
              {(error) => <SettingsBanner tone="error" description={error()} />}
            </Show>
          </div>
        </details>
      </SettingsCard>

    </SettingsPanel>
  );
}

export { AiSettings };
