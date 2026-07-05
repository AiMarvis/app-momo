import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js";

import {
  agentProviderState,
  clearOpenAiApiKey,
  copyCodexDiagnostic,
  openCodexSetup,
  refreshAgentProviderStatus,
  saveOpenAiApiKey,
} from "../agent_provider";
import { chatState, loadConfig, loadTools, saveConfig } from "../chat_store";
import { normalizeChatMode, normalizeCodexSandbox } from "../config";
import { formatToolIdentity, getToolInfo } from "../tool_identity";
import type { ChatMode, CodexSandboxMode } from "../types";
import { ChevronIcon, EyeIcon, EyeOffIcon } from "~/components/icons";
import ScrollArea from "~/components/scroll_area";
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
import { t, tf } from "~/i18n";
import { openSettings } from "~/stores/files";

function openAccountSettings(): void {
  openSettings({
    kind: "plugin",
    fillId: "core-auth.settings",
    anchor: "session",
  });
}

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
  const [openAiApiKey, setOpenAiApiKey] = createSignal("");
  const [showApiKey, setShowApiKey] = createSignal(false);
  const settingsRefreshToken = useSettingsRefreshToken();

  createEffect(
    on(
      settingsRefreshToken,
      () => {
        void Promise.all([loadConfig(), loadTools(), refreshAgentProviderStatus()]);
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
      codexSandbox() !== chatState.config.codexSandbox
    );
  });

  const saveButtonLabel = createMemo(() => {
    if (chatState.config.saving) return t("settings.plugin.ai_chat.action.saving");
    if (isUnsaved()) return t("settings.plugin.ai_chat.action.save_required");
    return t("settings.plugin.ai_chat.action.save");
  });

  const providerStatusLabel = createMemo(() => {
    if (agentProviderState.providerStatus === "codex_cli") {
      return t("settings.plugin.ai_chat.agent_provider.codex_ready");
    }
    return t("settings.plugin.ai_chat.agent_provider.setup_required");
  });

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
      <SettingsBanner
        tone="info"
        class="select-text"
        title={t("settings.plugin.ai_chat.guide.title")}
        description={
          <ol class="mt-1.5 list-decimal space-y-1.5 pl-4 text-xs/relaxed text-text-secondary [&_a]:text-text-primary [&_a]:underline [&_a]:underline-offset-2">
            <li>
              <strong class="text-text-primary">
                {t("settings.plugin.ai_chat.guide.connection_label")}
              </strong>{" "}
              {t("settings.plugin.ai_chat.guide.connection_before_link")}{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                class="whitespace-nowrap"
              >
                AI Studio
              </a>{" "}
              {t("settings.plugin.ai_chat.guide.connection_after_link")}
            </li>
            <li>
              <strong class="text-text-primary">
                {t("settings.plugin.ai_chat.guide.save_label")}
              </strong>{" "}
              {t("settings.plugin.ai_chat.guide.save_text")}
            </li>
            <li>
              <strong class="text-text-primary">
                {t("settings.plugin.ai_chat.guide.open_chat_label")}
              </strong>{" "}
              {t("settings.plugin.ai_chat.guide.open_chat_text")}
            </li>
          </ol>
        }
      />

      <SettingsCard
        title={t("settings.plugin.ai_chat.agent_provider.title")}
        description={t("settings.plugin.ai_chat.agent_provider.description")}
        tone="subtle"
        anchor="agent-provider"
        action={
          <SettingsStatusBadge
            tone={agentProviderState.providerStatus === "setup_required" ? "error" : "success"}
          >
            {providerStatusLabel()}
          </SettingsStatusBadge>
        }
      >
        <div class="space-y-3">
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
                      label: t("settings.plugin.ai_chat.codex_settings.sandbox.danger_full_access"),
                    },
                  ]}
                  value={codexSandbox()}
                  onChange={(value) => setCodexSandbox(normalizeCodexSandbox(value))}
                />
              }
            />
          </div>
          <SettingsBanner
            tone="warning"
            title={t("settings.plugin.ai_chat.openai.cost_title")}
            description={t("settings.plugin.ai_chat.openai.cost_description")}
          />
          <SettingsFieldRow
            stacked
            label={t("settings.plugin.ai_chat.openai.key_label")}
            description={
              agentProviderState.openai.configured
                ? t("settings.plugin.ai_chat.openai.configured")
                : t("settings.plugin.ai_chat.openai.not_configured")
            }
            control={
              <div class="flex w-full max-w-md flex-col gap-2 @sm:flex-row">
                <SettingsInput
                  type="password"
                  value={openAiApiKey()}
                  placeholder={t("settings.plugin.ai_chat.openai.placeholder")}
                  autocomplete="off"
                  spellcheck={false}
                  onInput={(event) => setOpenAiApiKey(event.currentTarget.value)}
                />
                <SettingsToolbarAction
                  variant="primary"
                  disabled={openAiApiKey().trim() === ""}
                  onClick={() => {
                    void saveOpenAiApiKey(openAiApiKey()).then(() => setOpenAiApiKey(""));
                  }}
                >
                  {t("settings.plugin.ai_chat.openai.save")}
                </SettingsToolbarAction>
                <SettingsToolbarAction
                  disabled={!agentProviderState.openai.configured}
                  onClick={() => void clearOpenAiApiKey()}
                >
                  {t("settings.plugin.ai_chat.openai.clear")}
                </SettingsToolbarAction>
              </div>
            }
          />
          <Show when={agentProviderState.error}>
            {(error) => <SettingsBanner tone="error" description={error()} />}
          </Show>
        </div>
      </SettingsCard>

      <SettingsBanner
        tone="info"
        class="select-text"
        title={t("settings.plugin.ai_chat.account_banner.title")}
        description={t("settings.plugin.ai_chat.account_banner.description")}
        action={
          <SettingsToolbarAction variant="primary" onClick={openAccountSettings}>
            {t("settings.plugin.ai_chat.account_banner.open_account")}
          </SettingsToolbarAction>
        }
      />

      <SettingsFieldRow
        label={t("settings.plugin.ai_chat.connection.label")}
        description={t("settings.plugin.ai_chat.connection.description")}
        control={
          <div class="w-full max-w-72">
            <SettingsSelect
              options={[
                { value: "remote", label: t("settings.plugin.ai_chat.connection.option_remote") },
                { value: "gemini", label: t("settings.plugin.ai_chat.connection.option_gemini") },
              ]}
              value={provider()}
              onChange={(value) => setProvider(value as "gemini" | "remote")}
            />
          </div>
        }
      />

      <Show when={provider() === "remote"}>
        <SettingsFieldRow
          label={t("settings.plugin.ai_chat.model.label")}
          description={t("settings.plugin.ai_chat.model.remote_description")}
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
        <SettingsBanner
          tone="info"
          class="py-2.5!"
          title={t("settings.plugin.ai_chat.remote_banner.title")}
          description={t("settings.plugin.ai_chat.remote_banner.description")}
        />
      </Show>

      <Show when={provider() === "gemini"}>
        <SettingsBanner
          tone="info"
          class="py-2.5! select-text"
          title={t("settings.plugin.ai_chat.gemini_banner.title")}
          description={
            <ol class="mt-1.5 list-decimal space-y-1.5 pl-4 text-[0.75rem] text-text-secondary">
              <li>{t("settings.plugin.ai_chat.gemini_banner.step1")}</li>
              <li>{t("settings.plugin.ai_chat.gemini_banner.step2")}</li>
              <li>{t("settings.plugin.ai_chat.gemini_banner.step3")}</li>
            </ol>
          }
        />

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
                  <span class="text-text-primary">{t("settings.plugin.ai_chat.action.save")}</span>{" "}
                  {t("settings.plugin.ai_chat.unsaved.inline_suffix")}
                </p>
              </Show>
            </div>
          }
        />

        <SettingsFieldRow
          label={t("settings.plugin.ai_chat.model.label")}
          description={t("settings.plugin.ai_chat.model.gemini_description")}
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
      </Show>

      <Show when={chatState.config.error}>
        {(error) => <SettingsBanner tone="error" description={error()} />}
      </Show>
      <Show when={chatState.config.toolsError}>
        {(error) => <SettingsBanner tone="error" description={error()} />}
      </Show>

      <SettingsCard
        title={t("settings.plugin.ai_chat.tools.title")}
        description={t("settings.plugin.ai_chat.tools.description")}
        tone="subtle"
      >
        <Show when={chatState.config.toolsLoading}>
          <p class="text-[0.75rem] text-text-muted">{t("settings.plugin.ai_chat.tools.loading")}</p>
        </Show>
        <Show when={!chatState.config.toolsLoading && chatState.config.availableTools.length > 0}>
          <p class="text-[0.75rem] text-text-muted">
            {chatState.config.availableTools.length === 1
              ? t("settings.plugin.ai_chat.tools.count_one")
              : tf("settings.plugin.ai_chat.tools.count_other", {
                  count: chatState.config.availableTools.length,
                })}
          </p>
          <details class="kuku-ai-tools-details mt-3 overflow-hidden rounded-sm border border-border/90 bg-bg-secondary/50 transition-shadow hover:border-border">
            <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 pr-2 text-left select-none marker:content-none [&::-webkit-details-marker]:hidden">
              <span class="flex min-w-0 items-center gap-2.5">
                <span class="flex size-6 shrink-0 items-center justify-center rounded-xs border border-border/80 bg-bg-elevated/80 text-icon">
                  <ChevronIcon
                    size={14}
                    class="kuku-ai-tools-chevron transition-transform duration-200"
                  />
                </span>
                <span>
                  <span class="block text-[0.8125rem] font-medium text-text-primary">
                    {t("settings.plugin.ai_chat.tools.summary_title")}
                  </span>
                  <span class="block text-[0.6875rem] text-text-muted">
                    {t("settings.plugin.ai_chat.tools.summary_hint")}
                  </span>
                </span>
              </span>
              <span class="shrink-0 rounded-xs border border-border/60 bg-bg-tertiary/80 px-2 py-0.5 text-[0.625rem] font-medium tracking-wide text-text-secondary uppercase">
                {t("settings.plugin.ai_chat.tools.tap")}
              </span>
            </summary>
            <div class="border-t border-border/50 bg-bg-primary/50 px-2.5 py-2">
              <ScrollArea axis="y" class="max-h-48 select-text">
                <div class="space-y-0.5 pr-0.5">
                  <For each={chatState.config.availableTools}>
                    {(tool) => {
                      const identity = () => formatToolIdentity(tool.toolId, tool.name);
                      const info = () => getToolInfo(tool.toolId ?? tool.name);
                      const showIdentity = () => identity() !== info().label;

                      return (
                        <SettingsListRow
                          title={<span class="text-[0.75rem]">{info().label}</span>}
                          description={
                            <span class="block space-y-1">
                              <span class="block text-[0.65rem] leading-snug text-text-secondary">
                                {info().description}
                              </span>
                              <Show when={showIdentity()}>
                                <span class="block font-mono text-[0.6rem] whitespace-pre-wrap text-text-muted/90">
                                  {identity()}
                                </span>
                              </Show>
                            </span>
                          }
                        />
                      );
                    }}
                  </For>
                </div>
              </ScrollArea>
            </div>
          </details>
        </Show>
        <Show when={!chatState.config.toolsLoading && chatState.config.availableTools.length === 0}>
          <SettingsBanner tone="info" description={t("settings.plugin.ai_chat.tools.empty")} />
        </Show>
      </SettingsCard>
    </SettingsPanel>
  );
}

export { AiSettings };
