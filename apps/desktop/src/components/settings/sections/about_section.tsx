import { getVersion } from "@tauri-apps/api/app";
import { Match, Switch, createSignal, onMount } from "solid-js";

import {
  SettingsListRow,
  SettingsMetricRow,
  SettingsPanel,
  SettingsProgress,
  SettingsToolbarAction,
} from "~/components/settings/settings_blocks";
import { t, tf } from "~/i18n";
import { checkForUpdates, downloadAndInstall, restart, updaterState } from "~/stores/updater";

function AboutSection() {
  const [version, setVersion] = createSignal(t("settings.about.version.loading"));
  const [manualCheckCompleted, setManualCheckCompleted] = createSignal(false);

  onMount(() => {
    void getVersion()
      .then((value) => setVersion(value))
      .catch(() => setVersion(t("settings.about.version.unknown")));
  });

  async function handleCheckForUpdates(): Promise<void> {
    setManualCheckCompleted(false);
    await checkForUpdates();
    setManualCheckCompleted(true);
  }

  return (
    <SettingsPanel
      title={t("settings.about.title")}
      description={t("settings.about.description")}
      anchor="about"
    >
      <div class="space-y-2">
        <SettingsMetricRow label={t("settings.about.metric.version")} value={version()} />
        <SettingsMetricRow label={t("settings.about.metric.license")} value="MIT" />
        <SettingsListRow
          title={t("settings.about.update.title")}
          description={
            <Switch>
              <Match when={updaterState.status === "checking"}>
                {t("settings.about.update.checking")}
              </Match>
              <Match when={updaterState.status === "available"}>
                {tf("settings.about.update.available", {
                  version: updaterState.version ?? t("settings.about.update.latest_version"),
                })}
              </Match>
              <Match when={updaterState.status === "downloading"}>
                <SettingsProgress
                  value={Math.round(updaterState.progress)}
                  max={100}
                  label={t("settings.about.update.download_progress")}
                />
              </Match>
              <Match when={updaterState.status === "ready"}>
                {t("settings.about.update.ready")}
              </Match>
              <Match when={updaterState.status === "error"}>
                {updaterState.errorMessage ?? t("updater.title.check_failed")}
              </Match>
              <Match when={manualCheckCompleted()}>{t("settings.about.update.current")}</Match>
              <Match when={true}>{t("settings.about.update.description")}</Match>
            </Switch>
          }
          action={
            <Switch>
              <Match when={updaterState.status === "available"}>
                <SettingsToolbarAction variant="primary" onClick={() => void downloadAndInstall()}>
                  {t("updater.action.update")}
                </SettingsToolbarAction>
              </Match>
              <Match when={updaterState.status === "downloading"}>
                <SettingsToolbarAction disabled>
                  {Math.round(updaterState.progress)}%
                </SettingsToolbarAction>
              </Match>
              <Match when={updaterState.status === "ready"}>
                <SettingsToolbarAction variant="primary" onClick={() => void restart()}>
                  {t("updater.action.restart_to_update")}
                </SettingsToolbarAction>
              </Match>
              <Match when={updaterState.status === "checking"}>
                <SettingsToolbarAction disabled>
                  {t("settings.about.update.checking")}
                </SettingsToolbarAction>
              </Match>
              <Match when={true}>
                <SettingsToolbarAction onClick={() => void handleCheckForUpdates()}>
                  {t("settings.about.update.check")}
                </SettingsToolbarAction>
              </Match>
            </Switch>
          }
        />
      </div>
    </SettingsPanel>
  );
}

export { AboutSection };
