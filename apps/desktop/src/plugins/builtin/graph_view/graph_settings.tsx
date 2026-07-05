// ── Graph Settings ──
//
// Module-level reactive store for renderer-specific graph view settings.
// 2D and 3D settings are persisted independently, while legacy single-scope
// settings are migrated into both scopes on load.

import { type JSX, For, Show } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";

import { ChevronIcon, CloseIcon } from "~/components/icons";
import Switch from "~/components/ui/switch";
import { t, type MessageKey } from "~/i18n";
import { loadPluginSettings, savePluginSettings } from "~/plugins/settings_store";

import {
  GRAPH_SETTINGS_DEFAULTS,
  GRAPH_VIEW_SETTINGS_DEFAULTS,
  mergeGraphViewSettings,
  type GraphSettings,
  type GraphSettingsScope,
  type GraphViewSettings,
} from "./graph_types";
import { replayGraphAnimation } from "./graph_animation";

const GRAPH_SETTINGS_PLUGIN_ID = "graph-view";

// ── Reactive Store (module-level singleton) ──────────────────

const [settings, setSettings] = createStore<GraphViewSettings>({
  twoD: { ...GRAPH_SETTINGS_DEFAULTS },
  threeD: { ...GRAPH_SETTINGS_DEFAULTS },
});

function scopeKey(scope: GraphSettingsScope): keyof GraphViewSettings {
  return scope === "3d" ? "threeD" : "twoD";
}

/** Read settings for one renderer. Defaults to 2D for legacy call sites. */
function getGraphSettings(scope: GraphSettingsScope = "2d"): GraphSettings {
  return settings[scopeKey(scope)];
}

/** Update one setting. The two-argument form updates 2D for legacy call sites. */
function updateGraphSetting<K extends keyof GraphSettings>(key: K, value: GraphSettings[K]): void;
function updateGraphSetting<K extends keyof GraphSettings>(
  scope: GraphSettingsScope,
  key: K,
  value: GraphSettings[K],
): void;
function updateGraphSetting<K extends keyof GraphSettings>(
  scopeOrKey: GraphSettingsScope | K,
  keyOrValue: K | GraphSettings[K],
  maybeValue?: GraphSettings[K],
): void {
  const scope = maybeValue === undefined ? "2d" : (scopeOrKey as GraphSettingsScope);
  const key = maybeValue === undefined ? (scopeOrKey as K) : (keyOrValue as K);
  const value = maybeValue === undefined ? keyOrValue : maybeValue;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (setSettings as any)(scopeKey(scope), key, value);
  void persistSettings();
}

function isNegativeMagnitudeSetting(key: keyof GraphSettings): boolean {
  return key === "chargeStrength" || key === "chargeStrengthOrphan";
}

function controlValueForGraphSetting(key: keyof GraphSettings, value: number): number {
  return isNegativeMagnitudeSetting(key) ? Math.abs(value) : value;
}

function graphSettingValueFromControl(key: keyof GraphSettings, value: number): number {
  return isNegativeMagnitudeSetting(key) ? -Math.abs(value) : value;
}

/** Reset one renderer if a scope is provided, otherwise reset all graph settings. */
function resetGraphSettings(scope?: GraphSettingsScope): void {
  if (scope) {
    setSettings(scopeKey(scope), reconcile({ ...GRAPH_SETTINGS_DEFAULTS }));
  } else {
    restoreGraphSettingsDefaults();
  }
  void persistSettings();
}

function restoreGraphSettingsDefaults(): void {
  setSettings(
    reconcile({
      twoD: { ...GRAPH_SETTINGS_DEFAULTS },
      threeD: { ...GRAPH_SETTINGS_DEFAULTS },
    }),
  );
}

/** Load persisted settings from Rust backend. */
async function loadGraphSettings(): Promise<void> {
  try {
    const next = await loadPluginSettings<GraphViewSettings>({
      pluginId: GRAPH_SETTINGS_PLUGIN_ID,
      defaults: GRAPH_VIEW_SETTINGS_DEFAULTS,
      normalize: (raw) => mergeGraphViewSettings(raw),
    });
    setSettings(reconcile(next));
    try {
      await savePluginSettings(GRAPH_SETTINGS_PLUGIN_ID, next);
    } catch {
      // Loaded settings are still valid even if normalizing the file fails.
    }
  } catch {
    // First launch or missing file — defaults are fine.
    restoreGraphSettingsDefaults();
  }
}

async function persistSettings(): Promise<void> {
  try {
    await savePluginSettings(GRAPH_SETTINGS_PLUGIN_ID, unwrap(settings));
  } catch {
    // Silently ignore persist failures.
  }
}

// ── Field Descriptors ────────────────────────────────────────

interface BaseFieldDesc {
  labelKey: MessageKey;
}

interface RangeFieldDesc extends BaseFieldDesc {
  key: keyof GraphSettings;
  min: number;
  max: number;
  step: number;
  type: "range";
}

interface ToggleFieldDesc extends BaseFieldDesc {
  key: keyof GraphSettings;
  type: "toggle";
}

interface ActionFieldDesc extends BaseFieldDesc {
  action: "replayAnimation";
  type: "action";
}

type FieldDesc = ActionFieldDesc | RangeFieldDesc | ToggleFieldDesc;

interface SectionDesc {
  titleKey: MessageKey;
  fields: FieldDesc[];
  collapsed?: boolean;
}

const FILTER_SECTION: SectionDesc = {
  titleKey: "settings.plugin.graph_view.section.filter",
  fields: [],
  collapsed: true,
};

const GROUP_SECTION: SectionDesc = {
  titleKey: "settings.plugin.graph_view.section.groups",
  fields: [],
  collapsed: true,
};

const DISPLAY_SECTION: SectionDesc = {
  titleKey: "settings.plugin.graph_view.section.display",
  fields: [
    {
      key: "showArrows",
      labelKey: "settings.plugin.graph_view.field.show_arrows",
      type: "toggle",
    },
    {
      key: "labelVisibilityThreshold",
      labelKey: "settings.plugin.graph_view.field.label_visibility_threshold",
      min: 0.5,
      max: 3,
      step: 0.1,
      type: "range",
    },
    {
      key: "nodeSize",
      labelKey: "settings.plugin.graph_view.field.node_size",
      min: 0.5,
      max: 2,
      step: 0.05,
      type: "range",
    },
    {
      key: "linkWidthScale",
      labelKey: "settings.plugin.graph_view.field.link_width_scale",
      min: 0.4,
      max: 2,
      step: 0.05,
      type: "range",
    },
    {
      action: "replayAnimation",
      labelKey: "settings.plugin.graph_view.action.replay_animation",
      type: "action",
    },
  ],
};

const FORCE_SECTION: SectionDesc = {
  titleKey: "settings.plugin.graph_view.section.forces",
  fields: [
    {
      key: "centerStrength",
      labelKey: "settings.plugin.graph_view.field.center_strength",
      min: 0,
      max: 0.5,
      step: 0.005,
      type: "range",
    },
    {
      key: "chargeStrength",
      labelKey: "settings.plugin.graph_view.field.charge_strength",
      min: 10,
      max: 500,
      step: 10,
      type: "range",
    },
    {
      key: "linkStrength",
      labelKey: "settings.plugin.graph_view.field.link_strength",
      min: 0,
      max: 2,
      step: 0.05,
      type: "range",
    },
    {
      key: "linkDistance",
      labelKey: "settings.plugin.graph_view.field.link_distance",
      min: 20,
      max: 500,
      step: 10,
      type: "range",
    },
  ],
};

function sectionsForMode(_mode: GraphSettingsScope): SectionDesc[] {
  return [FILTER_SECTION, GROUP_SECTION, DISPLAY_SECTION, FORCE_SECTION];
}

// ── Formatting helper ────────────────────────────────────────

function formatValue(value: number, step: number): string {
  if (step >= 1) return String(Math.round(value));
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return value.toFixed(decimals);
}

// ── Settings Panel Component ─────────────────────────────────

function GraphSettingsPanel(props: {
  mode: GraphSettingsScope;
  onClose?: () => void;
  class?: string;
}): JSX.Element {
  return (
    <div
      data-kuku-graph-settings-panel="true"
      data-kuku-graph-settings-scope={props.mode}
      class={`@container flex h-full min-h-0 w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xs border border-border/70 bg-bg-elevated/95 shadow-popover backdrop-blur-sm ${props.class ?? ""}`}
    >
      <div class="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-3 py-2.5">
        <div class="flex min-w-0 items-center gap-2">
          <span class="flex h-6 min-w-8 items-center justify-center rounded-xs bg-element-selected px-1.5 font-mono text-[0.6875rem] font-medium text-text-primary">
            {props.mode.toUpperCase()}
          </span>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            class="h-7 cursor-pointer rounded-xs border border-border bg-bg-secondary px-2 text-[0.6875rem] whitespace-nowrap text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            onClick={() => resetGraphSettings(props.mode)}
          >
            {t("settings.plugin.graph_view.reset_all")}
          </button>
          <Show when={props.onClose}>
            {(onClose) => (
              <button
                type="button"
                class="flex size-7 cursor-pointer items-center justify-center rounded-xs border-none bg-transparent text-text-muted transition-colors hover:bg-ghost-hover hover:text-text-primary"
                title="Close"
                onClick={onClose()}
              >
                <CloseIcon />
              </button>
            )}
          </Show>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <For each={sectionsForMode(props.mode)}>
          {(section) => (
            <section
              data-kuku-graph-settings-section
              class="border-b border-border/60 py-2 last:border-b-0"
            >
              <div class="mb-1.5 flex items-center gap-2 px-1">
                <ChevronIcon
                  size={12}
                  class={`shrink-0 text-text-muted transition-transform ${section.collapsed ? "" : "rotate-90"}`}
                />
                <span class="text-[0.625rem] font-medium tracking-wide text-text-muted uppercase">
                  {t(section.titleKey)}
                </span>
                <span aria-hidden="true" class="h-px min-w-4 flex-1 bg-border/50" />
              </div>
              <Show when={!section.collapsed}>
                <div class="space-y-1">
                  <For each={section.fields}>
                    {(field) => <SettingRow mode={props.mode} field={field} />}
                  </For>
                </div>
              </Show>
            </section>
          )}
        </For>
      </div>
    </div>
  );
}

// ── Row Components ───────────────────────────────────────────

function SettingRow(props: { mode: GraphSettingsScope; field: FieldDesc }): JSX.Element {
  if (props.field.type === "action") return <ActionRow field={props.field} />;
  if (props.field.type === "toggle") return <ToggleRow mode={props.mode} field={props.field} />;
  return <RangeRow mode={props.mode} field={props.field} />;
}

function RangeRow(props: { mode: GraphSettingsScope; field: RangeFieldDesc }): JSX.Element {
  const value = () => getGraphSettings(props.mode)[props.field.key] as number;
  const controlValue = () => controlValueForGraphSetting(props.field.key, value());
  const defaultVal = GRAPH_SETTINGS_DEFAULTS[props.field.key] as number;
  const isChanged = () => value() !== defaultVal;

  return (
    <div
      data-kuku-graph-settings-row
      class="rounded-xs p-1.5 transition-colors hover:bg-ghost-hover/60"
    >
      <div class="mb-1.5 flex min-w-0 items-center justify-between gap-3">
        <span
          class="min-w-0 truncate text-[0.6875rem] text-text-muted"
          classList={{ "text-text-secondary!": isChanged() }}
        >
          {t(props.field.labelKey)}
        </span>
        <span
          class="flex h-5 min-w-12 shrink-0 items-center justify-end rounded-xs bg-bg-secondary/70 px-1.5 font-mono text-[0.625rem] text-text-muted tabular-nums"
          classList={{ "text-accent!": isChanged() }}
        >
          {formatValue(controlValue(), props.field.step)}
        </span>
      </div>
      <input
        type="range"
        min={props.field.min}
        max={props.field.max}
        step={props.field.step}
        value={controlValue()}
        aria-label={t(props.field.labelKey)}
        class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ghost-hover accent-accent [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent"
        onInput={(e) => {
          const v = parseFloat(e.currentTarget.value);
          if (!Number.isNaN(v)) {
            const next = graphSettingValueFromControl(props.field.key, v);
            updateGraphSetting(
              props.mode,
              props.field.key,
              next as GraphSettings[keyof GraphSettings],
            );
          }
        }}
      />
    </div>
  );
}

function ToggleRow(props: { mode: GraphSettingsScope; field: ToggleFieldDesc }): JSX.Element {
  const value = () => getGraphSettings(props.mode)[props.field.key] as boolean;

  return (
    <div
      data-kuku-graph-settings-row
      class="flex items-center gap-3 rounded-xs p-1.5 transition-colors hover:bg-ghost-hover/60"
    >
      <span class="min-w-0 flex-1 truncate text-[0.6875rem] text-text-muted">
        {t(props.field.labelKey)}
      </span>
      <Switch
        checked={value()}
        onChange={(v) => {
          updateGraphSetting(props.mode, props.field.key, v as GraphSettings[keyof GraphSettings]);
        }}
      />
    </div>
  );
}

function ActionRow(props: { field: ActionFieldDesc }): JSX.Element {
  return (
    <button
      type="button"
      data-kuku-graph-settings-row
      class="mt-2 flex h-8 w-full cursor-pointer items-center justify-center rounded-xs border border-accent/35 bg-accent/80 px-3 text-[0.6875rem] font-medium text-bg-primary shadow-soft-1 transition-colors hover:bg-accent"
      onClick={() => {
        if (props.field.action === "replayAnimation") replayGraphAnimation();
      }}
    >
      {t(props.field.labelKey)}
    </button>
  );
}

// ── Exports ──

export {
  getGraphSettings,
  controlValueForGraphSetting,
  GraphSettingsPanel,
  graphSettingValueFromControl,
  loadGraphSettings,
  resetGraphSettings,
  restoreGraphSettingsDefaults,
  updateGraphSetting,
};
