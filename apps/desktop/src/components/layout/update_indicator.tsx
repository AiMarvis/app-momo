import { Match, Show, Switch } from "solid-js";

import { t, tf } from "~/i18n";
import { checkForUpdates, downloadAndInstall, restart, updaterState } from "~/stores/updater";

// ── Styling tokens shared across states ──

const PILL_BASE =
  "inline-flex items-center gap-1.5 h-6 px-4 rounded-xs border text-[11px] font-medium tracking-tight cursor-pointer select-none transition-colors duration-150";

// ── Component ──

/**
 * Subtle update affordance for the title bar.
 *
 * Visible states:
 *   - available   → "Update" pill (click to start download)
 *   - downloading → "Downloading N%" pill (non-clickable)
 *   - ready       → "Restart to update" pill (click to relaunch)
 *
 * Hidden when idle / checking to avoid chrome flicker on every launch.
 * `error` surfaces a red pill that the user can click to retry.
 */
function handleInstall(): void {
  void downloadAndInstall();
}

function handleRestart(): void {
  void restart();
}

function handleRetry(): void {
  void checkForUpdates();
}

export default function UpdateIndicator() {
  return (
    <Show when={updaterState.status !== "idle" && updaterState.status !== "checking"}>
      <div class="relative flex items-center">
        <Switch>
          <Match when={updaterState.status === "available"}>
            <button
              type="button"
              class={`${PILL_BASE} border-border-variant bg-element text-text-secondary hover:bg-element-hover hover:text-text-primary`}
              onClick={handleInstall}
              title={tf("updater.title.update_to_version", {
                version: updaterState.version ?? "latest",
              })}
            >
              <DotIndicator tone="info" />
              {t("updater.action.update")}
            </button>
          </Match>

          <Match when={updaterState.status === "downloading"}>
            <span
              class={`${PILL_BASE} cursor-default! border-border-variant bg-element text-text-secondary`}
            >
              <Spinner />
              {Math.round(updaterState.progress)}%
            </span>
          </Match>

          <Match when={updaterState.status === "ready"}>
            <button
              type="button"
              class={`${PILL_BASE} border-info-border bg-info-bg text-info hover:brightness-110`}
              onClick={handleRestart}
              title={t("updater.title.relaunch_to_finish")}
            >
              <DotIndicator tone="info" pulse />
              {t("updater.action.restart_to_update")}
            </button>
          </Match>

          <Match when={updaterState.status === "error"}>
            <button
              type="button"
              class={`${PILL_BASE} border-error-border bg-error-bg text-error hover:brightness-110`}
              onClick={handleRetry}
              title={updaterState.errorMessage ?? t("updater.title.check_failed")}
            >
              <DotIndicator tone="error" />
              {t("updater.action.update_failed")}
            </button>
          </Match>
        </Switch>
      </div>
    </Show>
  );
}

// ── Pieces ──

function DotIndicator(props: { tone: "info" | "error"; pulse?: boolean }) {
  const toneClass = props.tone === "info" ? "bg-info" : "bg-error";
  return (
    <span class="relative inline-flex size-1.5">
      <Show when={props.pulse}>
        <span
          class={`absolute inline-flex size-full animate-ping rounded-full ${toneClass} opacity-60`}
        />
      </Show>
      <span class={`relative inline-flex size-1.5 rounded-full ${toneClass}`} />
    </span>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      class="animate-spin"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity="0.22" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
      />
    </svg>
  );
}
