import { createEffect, createMemo, createSignal, For, onCleanup, Show, type JSX } from "solid-js";

import { chatState, saveConfig, switchMode } from "../chat_store";
import { normalizeChatMode, normalizeCodexSandbox } from "../config";
import type { ChatMode, CodexSandboxMode } from "../types";
import { t } from "~/i18n";

interface CodexSettingsPopoverProps {
  readonly registerApply: (apply: () => Promise<boolean>) => void;
}

const MODE_OPTIONS = [
  ["agent", "chat.mode.agent.title"],
  ["ask", "chat.mode.ask.title"],
  ["inline", "chat.mode.inline.title"],
] as const satisfies readonly (readonly [ChatMode, Parameters<typeof t>[0]])[];

const CUSTOM_MODEL_VALUE = "__custom__";

const OPENAI_MODEL_OPTIONS = [
  ["", "Codex default"],
  ["gpt-5.5", "GPT-5.5"],
  ["gpt-5-codex", "GPT-5 Codex"],
  ["gpt-5", "GPT-5"],
] as const;

const SANDBOX_OPTIONS = [
  ["read-only", "settings.plugin.ai_chat.codex_settings.sandbox.read_only"],
  ["workspace-write", "settings.plugin.ai_chat.codex_settings.sandbox.workspace_write"],
  ["danger-full-access", "settings.plugin.ai_chat.codex_settings.sandbox.danger_full_access"],
] as const satisfies readonly (readonly [CodexSandboxMode, Parameters<typeof t>[0]])[];

const CONTROL_CLASS = "h-7 rounded-sm border border-transparent bg-transparent px-1.5 text-[0.72rem] font-medium text-text-secondary outline-none transition-colors hover:bg-ghost-hover hover:text-text-primary focus:border-border-focused focus:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-50";

const MODEL_INPUT_CLASS = "h-7 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1.5 text-right text-[0.72rem] font-medium text-text-secondary outline-none transition-colors placeholder:text-text-muted/80 hover:bg-ghost-hover hover:text-text-primary focus:border-border-focused focus:bg-bg-secondary focus:text-text-primary disabled:cursor-not-allowed disabled:opacity-50";

function sandboxTitle(mode: CodexSandboxMode): string {
  switch (mode) {
    case "read-only":
      return t("settings.plugin.ai_chat.codex_settings.sandbox.read_only");
    case "workspace-write":
      return t("settings.plugin.ai_chat.codex_settings.sandbox.workspace_write");
    case "danger-full-access":
      return t("settings.plugin.ai_chat.codex_settings.sandbox.danger_full_access");
  }
}

function CodexSettingsPopover(props: CodexSettingsPopoverProps): JSX.Element {
  const [model, setModel] = createSignal("");
  const [sandbox, setSandbox] = createSignal<CodexSandboxMode>("read-only");

  const dirty = createMemo(() => {
    if (chatState.config.loading) return false;
    return (
      chatState.selectedMode !== chatState.config.defaultMode ||
      model().trim() !== chatState.config.codexModel ||
      sandbox() !== chatState.config.codexSandbox
    );
  });
  const summaryTitle = createMemo(
    () =>
      `${model().trim() || t("settings.plugin.ai_chat.codex_settings.model.placeholder")} / ${sandboxTitle(sandbox())}`,
  );
  const modelPreset = createMemo(() => {
    const trimmed = model().trim();
    if (OPENAI_MODEL_OPTIONS.some(([value]) => value === trimmed)) return trimmed;
    return CUSTOM_MODEL_VALUE;
  });

  async function apply(): Promise<boolean> {
    if (!dirty()) return true;
    return saveConfig({
      provider: chatState.config.provider,
      apiKey: chatState.config.apiKey,
      serverUrl: chatState.config.serverUrl,
      defaultMode: chatState.selectedMode,
      codexModel: model(),
      codexSandbox: sandbox(),
    });
  }

  async function chooseMode(value: string): Promise<void> {
    await switchMode(normalizeChatMode(value));
    await apply();
  }

  async function chooseModel(value: string): Promise<void> {
    if (value === CUSTOM_MODEL_VALUE) return;
    setModel(value);
    await apply();
  }

  async function chooseSandbox(value: string): Promise<void> {
    setSandbox(normalizeCodexSandbox(value));
    await apply();
  }

  function handleModelKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (event.currentTarget instanceof HTMLInputElement) {
      event.currentTarget.blur();
    }
    void apply();
  }

  createEffect(() => props.registerApply(apply));

  createEffect(() => {
    if (chatState.config.loading || chatState.config.saving) return;
    setModel(chatState.config.codexModel);
    setSandbox(chatState.config.codexSandbox);
  });

  onCleanup(() => props.registerApply(async () => true));

  return (
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1" title={summaryTitle()}>
      <select
        class={`${CONTROL_CLASS} max-w-[7.25rem] shrink-0 text-warning`}
        aria-label={t("settings.plugin.ai_chat.codex_settings.sandbox.label")}
        value={sandbox()}
        disabled={chatState.config.loading || chatState.config.saving}
        onChange={(event) => void chooseSandbox(event.currentTarget.value)}
      >
        <For each={SANDBOX_OPTIONS}>
          {([value, label]) => <option value={value}>{t(label)}</option>}
        </For>
      </select>
      <select
        class={`${CONTROL_CLASS} max-w-[5.5rem] shrink-0`}
        aria-label={t("chat.input.codex_settings.mode")}
        value={chatState.selectedMode}
        disabled={chatState.config.loading || chatState.config.saving}
        onChange={(event) => void chooseMode(event.currentTarget.value)}
      >
        <For each={MODE_OPTIONS}>
          {([value, title]) => <option value={value}>{t(title)}</option>}
        </For>
      </select>
      <select
        class={`${CONTROL_CLASS} w-[7.75rem] shrink-0`}
        aria-label={t("settings.plugin.ai_chat.codex_settings.model.label")}
        value={modelPreset()}
        disabled={chatState.config.loading || chatState.config.saving}
        onChange={(event) => void chooseModel(event.currentTarget.value)}
      >
        <For each={OPENAI_MODEL_OPTIONS}>
          {([value, label]) => (
            <option value={value}>
              {value === "" ? t("settings.plugin.ai_chat.codex_settings.model.placeholder") : label}
            </option>
          )}
        </For>
        <option value={CUSTOM_MODEL_VALUE}>
          {t("settings.plugin.ai_chat.codex_settings.model.custom")}
        </option>
      </select>
      <Show when={modelPreset() === CUSTOM_MODEL_VALUE}>
        <input
          class={MODEL_INPUT_CLASS}
          aria-label={t("settings.plugin.ai_chat.codex_settings.model.label")}
          type="text"
          value={model()}
          placeholder="gpt-5.5"
          spellcheck={false}
          disabled={chatState.config.loading || chatState.config.saving}
          onInput={(event) => setModel(event.currentTarget.value)}
          onBlur={() => void apply()}
          onKeyDown={handleModelKeyDown}
        />
      </Show>
      <Show when={chatState.config.error}>
        {(error) => <span class="basis-full truncate text-[0.68rem] text-error">{error()}</span>}
      </Show>
    </div>
  );
}

export { CodexSettingsPopover };
