import { getVersion } from "@tauri-apps/api/app";
import { createSignal, onMount } from "solid-js";

import { SettingsMetricRow, SettingsPanel } from "~/components/settings/settings_blocks";
import { t } from "~/i18n";

function AboutSection() {
  const [version, setVersion] = createSignal(t("settings.about.version.loading"));

  onMount(() => {
    void getVersion()
      .then((value) => setVersion(value))
      .catch(() => setVersion(t("settings.about.version.unknown")));
  });

  return (
    <SettingsPanel
      title={t("settings.about.title")}
      description={t("settings.about.description")}
      anchor="about"
    >
      <div class="space-y-2">
        <SettingsMetricRow label={t("settings.about.metric.version")} value={version()} />
        <SettingsMetricRow label={t("settings.about.metric.license")} value="MIT" />
      </div>
    </SettingsPanel>
  );
}

export { AboutSection };
