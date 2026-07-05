/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sourcePath = resolve(__dirname, "graph_settings.tsx");

function graphSettingsSource(): string {
  return readFileSync(sourcePath, "utf8");
}

describe("GraphSettingsPanel layout", () => {
  it("uses one panel surface with flat setting sections", () => {
    const source = graphSettingsSource();

    expect(source).toContain('data-kuku-graph-settings-panel="true"');
    expect(source).toContain("data-kuku-graph-settings-scope={props.mode}");
    expect(source).toContain("data-kuku-graph-settings-section");
    expect(source).toContain("data-kuku-graph-settings-row");
    expect(source).not.toContain('class="rounded-xs border border-border bg-bg-primary"');
  });

  it("does not show title or description copy inside the panel header", () => {
    const source = graphSettingsSource();

    expect(source).not.toContain('t("settings.plugin.graph_view.title")');
    expect(source).not.toContain('t("settings.plugin.graph_view.description")');
  });

  it("only exposes the screenshot-level graph controls", () => {
    const source = graphSettingsSource();

    for (const key of [
      "settings.plugin.graph_view.section.filter",
      "settings.plugin.graph_view.section.groups",
      "settings.plugin.graph_view.section.display",
      "settings.plugin.graph_view.section.forces",
      "settings.plugin.graph_view.field.show_arrows",
      "settings.plugin.graph_view.field.label_visibility_threshold",
      "settings.plugin.graph_view.field.node_size",
      "settings.plugin.graph_view.field.link_width_scale",
      "settings.plugin.graph_view.action.replay_animation",
      "settings.plugin.graph_view.field.center_strength",
      "settings.plugin.graph_view.field.charge_strength",
      "settings.plugin.graph_view.field.link_strength",
      "settings.plugin.graph_view.field.link_distance",
    ]) {
      expect(source).toContain(key);
    }

    for (const hiddenKey of [
      "settings.plugin.graph_view.field.charge_strength_orphan",
      "settings.plugin.graph_view.field.link_distance_same_folder",
      "settings.plugin.graph_view.field.link_distance_cross_folder",
      "settings.plugin.graph_view.field.cluster_strength",
      "settings.plugin.graph_view.field.cluster_radius_factor",
      "settings.plugin.graph_view.field.alpha_decay",
      "settings.plugin.graph_view.field.velocity_decay",
      "settings.plugin.graph_view.field.warmup_ticks",
      "settings.plugin.graph_view.field.cooldown_ticks",
      "settings.plugin.graph_view.field.node_min_size",
      "settings.plugin.graph_view.field.node_max_size",
      "settings.plugin.graph_view.field.node_size_scale",
      "settings.plugin.graph_view.field.orphan_node_size",
      "settings.plugin.graph_view.field.link_opacity",
      "settings.plugin.graph_view.field.hover_fade_opacity",
      "settings.plugin.graph_view.field.link_curvature",
      "settings.plugin.graph_view.field.arrow_length",
      "settings.plugin.graph_view.field.cluster_padding",
      "settings.plugin.graph_view.field.show_clusters",
      "settings.plugin.graph_view.field.show_backlinks",
    ]) {
      expect(source).not.toContain(hiddenKey);
    }
  });
});
