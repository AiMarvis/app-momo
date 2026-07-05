import { ErrorBoundary, Show, Suspense } from "solid-js";
import { Dynamic } from "solid-js/web";

import { t } from "~/i18n";
import { PluginErrorUI, PluginSkeleton, slotRegistry } from "~/plugins/slots";

import { SettingsBanner } from "./settings_blocks";
import { SettingsRefreshProvider } from "./settings_refresh";

function PluginSettingsSection(props: { fillId: string; settingsRefreshToken: number }) {
  const fill = () =>
    slotRegistry.fills.settingsSection.find(
      (entry) => entry.id === props.fillId && entry.isActive(),
    );

  return (
    <Show
      when={fill()}
      fallback={<SettingsBanner tone="info" description={t("settings.plugins.unavailable")} />}
    >
      {(activeFill) => (
        <div data-settings-anchor={`plugin:${props.fillId}`}>
          <ErrorBoundary
            fallback={(error: Error, reset: () => void) => (
              <PluginErrorUI pluginId={activeFill().pluginId} error={error} onReset={reset} />
            )}
          >
            <Suspense fallback={<PluginSkeleton />}>
              <SettingsRefreshProvider value={props.settingsRefreshToken}>
                <Dynamic component={activeFill().component} />
              </SettingsRefreshProvider>
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
    </Show>
  );
}

export { PluginSettingsSection };
