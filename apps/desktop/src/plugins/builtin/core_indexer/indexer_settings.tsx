import { createEffect, createSignal, on, onCleanup, Show, type JSX } from "solid-js";

import {
  SettingsBanner,
  SettingsCard,
  SettingsFieldRow,
  SettingsMetricRow,
  SettingsPanel,
  SettingsProgress,
  SettingsSelect,
  SettingsStatusBadge,
  SettingsToolbarAction,
} from "~/components/settings/settings_blocks";
import Switch from "~/components/ui/switch";
import { useSettingsRefreshToken } from "~/components/settings/settings_refresh";
import { t } from "~/i18n";

import { hydrateIndexerConfigFromSettings, indexerConfig, updateIndexerConfig } from "./settings";
import type { IndexerConfig } from "./types";
import { indexerStatus, refreshIndexerStatus } from "../core_indexer/status_store";
import { getSearchService } from "../search/runtime";

const STORAGE_LOCATION_OPTIONS = [
  { value: "app-global", label: t("settings.plugin.indexer.storage.app_global") },
  { value: "vault-local", label: t("settings.plugin.indexer.storage.vault_local") },
] satisfies { value: IndexerConfig["storageLocation"]; label: string }[];

function formatTimestamp(ts: number | null): string {
  if (!ts) return t("settings.plugin.indexer.metrics.never");
  const date = new Date(ts);
  return date.toLocaleString();
}

function statusLabel(state: string): string {
  if (state === "indexing") return t("settings.plugin.indexer.status.indexing");
  if (state === "error") return t("settings.plugin.indexer.status.error");
  return t("settings.plugin.indexer.status.ready");
}

function statusTone(state: string): "success" | "info" | "error" {
  if (state === "error") return "error";
  if (state === "indexing") return "info";
  return "success";
}

function IndexerSettings(): JSX.Element {
  const [isRefreshingStatus, setIsRefreshingStatus] = createSignal(false);
  const [isRebuildStarting, setIsRebuildStarting] = createSignal(false);
  const isIndexing = () => indexerStatus.state === "indexing";
  const settingsRefreshToken = useSettingsRefreshToken();
  let pollTimer: number | undefined;
  let rebuildBaselineLastIndexedAt: number | null = null;
  let rebuildIssuedAt: number | null = null;

  function clearPolling(): void {
    if (pollTimer !== undefined) {
      window.clearInterval(pollTimer);
      pollTimer = undefined;
    }
  }

  function maybeResolveRebuildStart(): void {
    if (!isRebuildStarting()) return;

    if (indexerStatus.state === "indexing" || indexerStatus.state === "error") {
      setIsRebuildStarting(false);
      rebuildBaselineLastIndexedAt = null;
      rebuildIssuedAt = null;
      return;
    }

    if (
      rebuildBaselineLastIndexedAt !== null &&
      indexerStatus.lastIndexedAt !== null &&
      indexerStatus.lastIndexedAt !== rebuildBaselineLastIndexedAt
    ) {
      setIsRebuildStarting(false);
      rebuildBaselineLastIndexedAt = null;
      rebuildIssuedAt = null;
      return;
    }

    if (rebuildIssuedAt !== null && Date.now() - rebuildIssuedAt > 5000) {
      setIsRebuildStarting(false);
      rebuildBaselineLastIndexedAt = null;
      rebuildIssuedAt = null;
    }
  }

  async function syncIndexerStatus(options?: {
    reloadConfig?: boolean;
    allowWhileRefreshing?: boolean;
  }): Promise<void> {
    if (isRefreshingStatus() && !options?.allowWhileRefreshing) {
      return;
    }

    const service = getSearchService();
    if (!service) return;

    setIsRefreshingStatus(true);
    try {
      if (options?.reloadConfig) {
        await hydrateIndexerConfigFromSettings();
      }
      await refreshIndexerStatus(service);
      maybeResolveRebuildStart();
    } finally {
      setIsRefreshingStatus(false);
    }
  }

  createEffect(
    on(
      settingsRefreshToken,
      () => {
        clearPolling();
        void syncIndexerStatus({ reloadConfig: true, allowWhileRefreshing: true });
        pollTimer = window.setInterval(() => {
          void syncIndexerStatus();
        }, 500);
      },
      { defer: false },
    ),
  );

  onCleanup(() => {
    clearPolling();
  });

  async function handleRebuild(): Promise<void> {
    const service = getSearchService();
    if (!service || isRebuildStarting() || isIndexing()) return;

    rebuildBaselineLastIndexedAt = indexerStatus.lastIndexedAt;
    rebuildIssuedAt = Date.now();
    setIsRebuildStarting(true);

    await service.requestRebuild();
    await syncIndexerStatus({ allowWhileRefreshing: true });
  }

  async function handleRefreshStatus(): Promise<void> {
    await syncIndexerStatus({ allowWhileRefreshing: true });
  }

  async function handleConfigChange<K extends keyof IndexerConfig>(
    key: K,
    value: IndexerConfig[K],
  ): Promise<void> {
    const service = getSearchService();
    if (!service) return;
    await updateIndexerConfig(service, key, value);
    await refreshIndexerStatus(service);
  }

  return (
    <SettingsPanel
      title={t("settings.plugin.indexer.title")}
      description={t("settings.plugin.indexer.description")}
      action={
        <SettingsToolbarAction
          disabled={isRefreshingStatus() || isRebuildStarting()}
          onClick={() => void handleRefreshStatus()}
        >
          {isRefreshingStatus()
            ? t("settings.plugin.indexer.action.refreshing")
            : t("settings.plugin.indexer.action.refresh")}
        </SettingsToolbarAction>
      }
    >
      <SettingsCard
        title={t("settings.plugin.indexer.index_status.title")}
        tone="subtle"
        action={
          <SettingsStatusBadge tone={statusTone(indexerStatus.state)}>
            {statusLabel(indexerStatus.state)}
          </SettingsStatusBadge>
        }
      >
        <div class="space-y-1.5">
          <SettingsMetricRow
            label={t("settings.plugin.indexer.metrics.documents")}
            value={`${indexerStatus.indexedDocs} / ${indexerStatus.totalDocs}`}
          />
          <SettingsMetricRow
            label={t("settings.plugin.indexer.metrics.resolved_links")}
            value={String(indexerStatus.resolvedLinks)}
          />
          <SettingsMetricRow
            label={t("settings.plugin.indexer.metrics.unresolved_links")}
            value={String(indexerStatus.unresolvedLinks)}
          />
          <SettingsMetricRow
            label={t("settings.plugin.indexer.metrics.ambiguous_links")}
            value={String(indexerStatus.ambiguousLinks)}
          />
          <SettingsMetricRow
            label={t("settings.plugin.indexer.metrics.last_indexed")}
            value={formatTimestamp(indexerStatus.lastIndexedAt)}
          />
        </div>

        <Show when={isIndexing() && indexerStatus.totalDocs > 0}>
          <SettingsProgress
            class="mt-3"
            tone="info"
            label={t("settings.plugin.indexer.index_status.progress")}
            value={indexerStatus.indexedDocs}
            max={indexerStatus.totalDocs}
          />
        </Show>
      </SettingsCard>

      <Show when={indexerStatus.error}>
        {(error) => <SettingsBanner tone="error" description={error()} />}
      </Show>

      <SettingsCard
        title={t("settings.plugin.indexer.wikilink.title")}
        description={t("settings.plugin.indexer.wikilink.description")}
        tone="subtle"
      >
        <div class="space-y-3">
          <SettingsFieldRow
            label={t("settings.plugin.indexer.storage.label")}
            description={t("settings.plugin.indexer.storage.description")}
            control={
              <div class="w-full max-w-64">
                <SettingsSelect
                  options={STORAGE_LOCATION_OPTIONS}
                  value={indexerConfig.storageLocation}
                  onChange={(value) =>
                    void handleConfigChange(
                      "storageLocation",
                      value as IndexerConfig["storageLocation"],
                    )
                  }
                  placeholder={t("settings.plugin.indexer.storage.placeholder")}
                  label={t("settings.plugin.indexer.storage.label")}
                />
              </div>
            }
          />
          <SettingsFieldRow
            label={t("settings.plugin.indexer.incremental.label")}
            description={t("settings.plugin.indexer.incremental.description")}
            control={
              <Switch
                checked={indexerConfig.incrementalUpdates}
                onChange={(checked) => void handleConfigChange("incrementalUpdates", checked)}
              />
            }
          />
          <SettingsFieldRow
            label={t("settings.plugin.indexer.reindex_on_open.label")}
            description={t("settings.plugin.indexer.reindex_on_open.description")}
            control={
              <Switch
                checked={indexerConfig.reindexOnVaultOpen}
                onChange={(checked) => void handleConfigChange("reindexOnVaultOpen", checked)}
              />
            }
          />
        </div>
      </SettingsCard>

      <SettingsCard
        tone="muted"
        description={t("settings.plugin.indexer.rebuild.description")}
        action={
          <SettingsToolbarAction
            variant="warning"
            disabled={isIndexing() || isRebuildStarting()}
            onClick={() => void handleRebuild()}
          >
            {isIndexing() || isRebuildStarting()
              ? t("settings.plugin.indexer.rebuild.indexing")
              : t("settings.plugin.indexer.rebuild.button")}
          </SettingsToolbarAction>
        }
      >
        <div class="text-[0.6875rem] text-text-muted">
          {t("settings.plugin.indexer.rebuild.help")}
        </div>
      </SettingsCard>
    </SettingsPanel>
  );
}

export { IndexerSettings };
