import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadPluginSettings, savePluginSettings } from "~/plugins/settings_store";
import {
  controlValueForGraphSetting,
  getGraphSettings,
  graphSettingValueFromControl,
  loadGraphSettings,
  resetGraphSettings,
  restoreGraphSettingsDefaults,
  updateGraphSetting,
} from "./graph_settings";
import { GRAPH_SETTINGS_DEFAULTS, GRAPH_VIEW_SETTINGS_DEFAULTS } from "./graph_types";

vi.mock("~/plugins/settings_store", () => ({
  loadPluginSettings: vi.fn(async ({ defaults }) => defaults),
  savePluginSettings: vi.fn(async () => undefined),
}));

const loadPluginSettingsMock = vi.mocked(loadPluginSettings);
const savePluginSettingsMock = vi.mocked(savePluginSettings);

describe("renderer scoped graph settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreGraphSettingsDefaults();
  });

  it("updates 2D and 3D settings independently", () => {
    updateGraphSetting("2d", "chargeStrength", -180);
    updateGraphSetting("3d", "chargeStrength", -420);
    updateGraphSetting("3d", "nodeMaxSize", 22);

    expect(getGraphSettings("2d").chargeStrength).toBe(-180);
    expect(getGraphSettings("3d").chargeStrength).toBe(-420);
    expect(getGraphSettings("2d").nodeMaxSize).toBe(GRAPH_SETTINGS_DEFAULTS.nodeMaxSize);
    expect(getGraphSettings("3d").nodeMaxSize).toBe(22);
  });

  it("keeps legacy two-argument updates scoped to 2D", () => {
    updateGraphSetting("linkOpacity", 1.45);

    expect(getGraphSettings("2d").linkOpacity).toBe(1.45);
    expect(getGraphSettings("3d").linkOpacity).toBe(GRAPH_SETTINGS_DEFAULTS.linkOpacity);
  });

  it("resets only the requested renderer scope", () => {
    updateGraphSetting("2d", "linkWidthScale", 1.8);
    updateGraphSetting("3d", "linkWidthScale", 0.6);

    resetGraphSettings("3d");

    expect(getGraphSettings("2d").linkWidthScale).toBe(1.8);
    expect(getGraphSettings("3d").linkWidthScale).toBe(GRAPH_SETTINGS_DEFAULTS.linkWidthScale);
  });

  it("presents repulsion settings as positive spacing controls while storing negative physics values", () => {
    expect(controlValueForGraphSetting("chargeStrength", -255)).toBe(255);
    expect(controlValueForGraphSetting("chargeStrengthOrphan", -110)).toBe(110);
    expect(graphSettingValueFromControl("chargeStrength", 420)).toBe(-420);
    expect(graphSettingValueFromControl("chargeStrengthOrphan", 75)).toBe(-75);
    expect(graphSettingValueFromControl("linkOpacity", 1.45)).toBe(1.45);
  });

  it("persists legacy settings as renderer-scoped settings after load", async () => {
    loadPluginSettingsMock.mockImplementationOnce(
      async ({ normalize }) =>
        normalize?.(
          { ...GRAPH_SETTINGS_DEFAULTS, chargeStrength: -500 },
          GRAPH_VIEW_SETTINGS_DEFAULTS,
        ) as never,
    );

    await loadGraphSettings();

    expect(savePluginSettingsMock).toHaveBeenCalledWith(
      "graph-view",
      expect.objectContaining({
        twoD: expect.objectContaining({ chargeStrength: -500 }),
        threeD: expect.objectContaining({ chargeStrength: -500 }),
      }),
    );
  });
});
