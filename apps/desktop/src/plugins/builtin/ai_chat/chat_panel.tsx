import { createEffect, on, onCleanup, onMount, Show, type JSX } from "solid-js";

import {
  agentProviderState,
  continueWithoutAgent,
  copyCodexDiagnostic,
  openCodexSetup,
  refreshAgentProviderStatus,
  shouldRenderExistingAiChatSurface,
  shouldShowAgentSetupPrompt,
} from "./agent_provider";
import { shouldBlockRemotePermission } from "./chat_panel_permissions";
import { chatState, loadConfig } from "./chat_store";
import { ChatHeader } from "./components/chat_header";
import { ChatInput } from "./components/chat_input";
import { ChatMessages } from "./components/chat_messages";
import ScrollArea, { type ScrollAreaHandle } from "~/components/scroll_area";
import { KukuIcon, SettingsIcon } from "~/components/icons";
import { t } from "~/i18n";
import { openSettings } from "~/stores/files";
import { vaultDragState } from "~/stores/vault_drag";
import { authState, getAuthService } from "~/plugins/builtin/core_auth/auth_service";

function AccessPrompt(): JSX.Element {
  return (
    <div class="flex flex-1 flex-col items-center justify-center px-5 py-10">
      <div class="w-full max-w-sm rounded-lg border border-border/70 bg-bg-secondary/80 p-8 text-center">
        <div class="mb-1 inline-flex size-10 items-center justify-center rounded-lg border border-border/60 bg-bg-elevated text-text-secondary">
          <KukuIcon size={22} />
        </div>
        <div class="mt-4 space-y-1.5">
          <h2 class="text-lg font-semibold tracking-tight text-text-primary">
            {t("chat.panel.setup.title")}
          </h2>
          <p class="mx-auto max-w-56 text-[0.8125rem] leading-relaxed text-text-secondary">
            {t("chat.panel.setup.description")}
          </p>
          <p class="mx-auto max-w-56 text-xs/relaxed text-text-muted">
            {agentProviderState.codex.userFacingStatus}
          </p>
        </div>

        <div class="mt-6 flex flex-col items-stretch gap-2.5">
          <Show
            when={shouldShowAgentSetupPrompt()}
            fallback={
              <p class="text-[0.7rem] leading-relaxed text-text-muted">
                {t("chat.panel.setup.byok_hint")}
              </p>
            }
          >
            <button
              type="button"
              class="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-accent/35 bg-accent/12 px-4 text-sm font-medium text-accent transition hover:bg-accent/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={agentProviderState.loading}
              onClick={() => void openCodexSetup()}
            >
              <KukuIcon size={14} />
              {t("chat.panel.setup.open_codex")}
            </button>

            <p class="text-[0.7rem] leading-relaxed text-text-muted">
              {t("chat.panel.setup.codex_hint")}
            </p>

            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="inline-flex min-h-9 items-center justify-center rounded-lg border border-border/80 bg-bg-elevated px-3 text-[0.75rem] font-medium text-text-primary transition hover:bg-ghost-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={agentProviderState.loading}
                onClick={() => void refreshAgentProviderStatus()}
              >
                {agentProviderState.loading
                  ? t("chat.panel.setup.checking")
                  : t("chat.panel.setup.check_again")}
              </button>
              <button
                type="button"
                class="inline-flex min-h-9 items-center justify-center rounded-lg border border-border/80 bg-bg-elevated px-3 text-[0.75rem] font-medium text-text-primary transition hover:bg-ghost-hover active:scale-[0.99]"
                onClick={continueWithoutAgent}
              >
                {t("chat.panel.setup.continue_without_agent")}
              </button>
            </div>
          </Show>

          <button
            type="button"
            class="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border/80 bg-bg-elevated px-4 text-sm font-medium text-text-primary transition hover:bg-ghost-hover active:scale-[0.99]"
            onClick={() =>
              openSettings({
                kind: "plugin",
                fillId: "ai-chat.settings",
                anchor: "agent-provider",
              })
            }
          >
            <SettingsIcon size={14} />
            {t("chat.panel.setup.open_settings")}
          </button>

          <Show when={shouldShowAgentSetupPrompt()}>
            <p class="text-[0.7rem] leading-relaxed text-text-muted">
              {t("chat.panel.setup.byok_hint")}
            </p>
            <button
              type="button"
              class="text-[0.7rem] font-medium text-text-muted underline underline-offset-2 transition hover:text-text-secondary"
              onClick={() => void copyCodexDiagnostic()}
            >
              {t("chat.panel.setup.copy_diagnostic")}
            </button>
          </Show>
        </div>

        <Show when={authState.error}>
          {(error) => <p class="mt-4 text-[0.7rem] text-error">{error()}</p>}
        </Show>
        <Show when={chatState.config.error}>
          {(error) => <p class="mt-2 text-[0.7rem] text-error">{error()}</p>}
        </Show>
      </div>
    </div>
  );
}

function RemotePermissionPrompt(): JSX.Element {
  return (
    <div class="flex flex-1 flex-col items-center justify-center px-5 py-10">
      <div class="w-full max-w-sm rounded-lg border border-border/70 bg-bg-secondary/80 p-8 text-center">
        <div class="mb-1 inline-flex size-10 items-center justify-center rounded-lg border border-warning-border/50 bg-warning-bg text-warning">
          <SettingsIcon size={22} />
        </div>

        <div class="mt-4 space-y-1.5">
          <h2 class="text-lg font-semibold tracking-tight text-text-primary">
            {t("chat.panel.permission.title")}
          </h2>
          <p class="mx-auto max-w-56 text-[0.8125rem] leading-relaxed text-text-secondary">
            {t("chat.panel.permission.description")}
          </p>
        </div>

        <button
          type="button"
          class="mt-6 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-accent/35 bg-accent/12 px-4 text-sm font-medium text-accent transition hover:bg-accent/20 active:scale-[0.99]"
          onClick={() =>
            openSettings({
              kind: "plugin",
              fillId: "core-auth.settings",
              anchor: "authorizations",
            })
          }
        >
          <SettingsIcon size={14} />
          {t("chat.panel.setup.open_settings")}
        </button>
      </div>
    </div>
  );
}

// ── Main Chat Panel ──

function ChatPanel(): JSX.Element {
  let scrollHandle: ScrollAreaHandle | undefined;
  let pendingAutoscroll = false;
  let pendingScrollFrame = 0;
  let userScrolledAway = false;
  /** After programmatic scroll, ignore a few onScrolls so "follow" is not lost. */
  let ignoreScrollEvents = 0;

  const isApiKeyMissing = () =>
    chatState.config.provider === "gemini" && !chatState.config.loading && !chatState.config.apiKey;
  const needsRemoteLogin = () =>
    chatState.config.provider === "remote" && !chatState.config.loading && !authState.authenticated;
  const needsRemotePermission = () =>
    shouldBlockRemotePermission({
      codexReady: agentProviderState.providerStatus === "codex_cli",
      provider: chatState.config.provider,
      configLoading: chatState.config.loading,
      authenticated: authState.authenticated,
      pluginAuthorized: getAuthService()?.isPluginAuthorized("ai-chat") === true,
    });

  // Reload config when panel mounts so we pick up changes made in Settings.
  onMount(() => {
    void loadConfig();
    void refreshAgentProviderStatus();
  });

  createEffect(() => {
    if (chatState.config.provider === "remote") {
      void getAuthService()?.authorizationHeaders("ai-chat");
    }
  });

  onCleanup(() => {
    if (pendingScrollFrame) {
      cancelAnimationFrame(pendingScrollFrame);
    }
  });

  // ── Scroll: follow the bottom of the transcript (classic chat) unless the user scrolls up ──

  function isNearBottom(): boolean {
    if (!scrollHandle) return true;
    const position = scrollHandle.getScrollPosition();
    const threshold = 80;
    return position.scrollHeight - position.top - position.height < threshold;
  }

  function isAwaitingResponse(): boolean {
    const activeId = chatState.activeSessionId;
    const session = activeId ? (chatState.sessions[activeId] ?? null) : null;
    return session?.status === "streaming" || session?.status === "applying";
  }

  function scrollToBottom(behavior: ScrollBehavior = "smooth"): void {
    if (!scrollHandle) return;
    // Smooth scroll emits many onScrolls; do not let them clear "follow" mid-animation.
    ignoreScrollEvents = 20;
    scrollHandle.update();
    const position = scrollHandle.getScrollPosition();
    scrollHandle.scrollTo({
      top: position.scrollHeight,
      behavior,
    });
    userScrolledAway = false;
  }

  /** Nudge the scroll target so the latest user line sits under the header with air (OS viewport). */
  function revealLatestUserToView(): void {
    if (!scrollHandle) return;
    const el = document.querySelector<HTMLElement>("[data-kuku-latest-user]");
    if (el) {
      ignoreScrollEvents = 20;
      scrollHandle.update();
      scrollHandle.alignElementToBlockStart(el, { paddingTop: 40, behavior: "smooth" });
    } else {
      scrollToBottom("smooth");
    }
    userScrolledAway = false;
  }

  function runPendingAutoscroll(): void {
    if (!scrollHandle) return;
    if (userScrolledAway) {
      return;
    }
    const activeId = chatState.activeSessionId;
    const session = activeId ? (chatState.sessions[activeId] ?? null) : null;
    if (!session || session.messages.length === 0) {
      return;
    }
    const last = session.messages[session.messages.length - 1];
    if (last.kind === "text" && last.role === "user" && !isAwaitingResponse()) {
      revealLatestUserToView();
    } else {
      scrollToBottom("smooth");
    }
  }

  function cancelPendingAutoscroll(): void {
    pendingAutoscroll = false;
    if (!pendingScrollFrame) return;
    cancelAnimationFrame(pendingScrollFrame);
    pendingScrollFrame = 0;
  }

  function scheduleAutoscroll(): void {
    if (userScrolledAway) return;
    pendingAutoscroll = true;
    if (pendingScrollFrame) return;

    pendingScrollFrame = requestAnimationFrame(() => {
      scrollHandle?.update();
      pendingScrollFrame = 0;
      if (!pendingAutoscroll) return;
      pendingAutoscroll = false;
      runPendingAutoscroll();
    });
  }

  function handleScroll(): void {
    if (ignoreScrollEvents > 0) {
      ignoreScrollEvents -= 1;
      return;
    }
    userScrolledAway = !isNearBottom();
    if (userScrolledAway) {
      cancelPendingAutoscroll();
    }
  }

  function handleWheel(event: WheelEvent): void {
    if (event.deltaY >= 0 || !scrollHandle) return;
    const position = scrollHandle.getScrollPosition();
    if (position.top <= 0 || position.scrollHeight <= position.height) return;
    ignoreScrollEvents = 0;
    userScrolledAway = true;
    cancelPendingAutoscroll();
    scrollHandle.scrollTo({ top: position.top, behavior: "auto" });
  }

  // Structural + coarser streaming: last message is user → reveal; assistant reply → follow bottom (bucketed).

  createEffect(
    on(
      () => {
        const activeId = chatState.activeSessionId;
        const session = activeId ? (chatState.sessions[activeId] ?? null) : null;
        const count = session?.messages.length ?? 0;
        const last = count > 0 && session ? session.messages[count - 1] : null;
        const status = session?.status ?? "idle";
        let hasFirstToken = false;
        let lastStreaming = false;
        let streamChunk = 0;
        if (last?.kind === "text") {
          hasFirstToken = last.content.length > 0;
          lastStreaming = last.streaming === true;
          if (last.role === "assistant" && lastStreaming) {
            // Coarse buckets so we do not start overlapping smooth scroll animations too often.
            streamChunk = Math.floor(last.content.length / 96);
          }
        }
        return `${activeId ?? ""}|${status}|${count}|${last?.id ?? ""}|${lastStreaming}|${hasFirstToken}|${streamChunk}`;
      },
      () => {
        const activeId = chatState.activeSessionId;
        const session = activeId ? (chatState.sessions[activeId] ?? null) : null;
        const count = session?.messages.length ?? 0;
        if (!activeId || count === 0) return;
        if (userScrolledAway) return;
        scheduleAutoscroll();
      },
    ),
  );

  // Reset scroll position when the active session changes.
  createEffect(
    on(
      () => chatState.activeSessionId,
      () => {
        userScrolledAway = false;
        scheduleAutoscroll();
      },
    ),
  );

  // ── Render ──

  return (
    <div
      class="relative flex h-full min-h-0 flex-col"
      data-kuku-ai-chat
      data-ai-chat-dropzone="true"
    >
      <Show when={vaultDragState.chatDropActive}>
        <div data-kuku-ai-chat-drop />
      </Show>
      <ChatHeader />

      <Show
        when={shouldRenderExistingAiChatSurface({
          apiKeyMissing: isApiKeyMissing(),
          remoteLoginRequired: needsRemoteLogin(),
        })}
        fallback={<AccessPrompt />}
      >
        <Show when={!needsRemotePermission()} fallback={<RemotePermissionPrompt />}>
          <ScrollArea
            axis="y"
            class="min-h-0 flex-1"
            handleRef={(handle) => {
              scrollHandle = handle;
            }}
            onViewportReady={() => {
              scheduleAutoscroll();
            }}
            onLayout={(_, reason) => {
              if (reason === "resize" || (reason === "content" && !isAwaitingResponse())) {
                scheduleAutoscroll();
              }
            }}
            onScroll={() => {
              handleScroll();
            }}
            onWheel={(event) => {
              handleWheel(event);
            }}
          >
            <ChatMessages />
          </ScrollArea>

          <ChatInput />
        </Show>
      </Show>
    </div>
  );
}

export default ChatPanel;
