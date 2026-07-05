import { describe, expect, it } from "vitest";

import {
  graphNodeLocalGap,
  graphNodePairRepulsionRadius,
  graphNodeSpacingScale,
} from "./graph_layout";
import { GRAPH_SETTINGS_DEFAULTS, type GraphSettings } from "./graph_types";

function withSettings(overrides: Partial<GraphSettings>): GraphSettings {
  return { ...GRAPH_SETTINGS_DEFAULTS, ...overrides };
}

describe("graph layout spacing settings", () => {
  it("maps stronger node spacing to a visibly larger 2D local gap", () => {
    const tight = graphNodeLocalGap(withSettings({ chargeStrength: -10 }), "normal");
    const defaultGap = graphNodeLocalGap(GRAPH_SETTINGS_DEFAULTS, "normal");
    const loose = graphNodeLocalGap(withSettings({ chargeStrength: -500 }), "normal");

    expect(tight).toBeLessThan(defaultGap);
    expect(loose).toBeGreaterThan(defaultGap);
    expect(loose / tight).toBeGreaterThan(1.6);
  });

  it("uses orphan spacing for pairs with unlinked nodes", () => {
    const tight = withSettings({ chargeStrengthOrphan: -10 });
    const loose = withSettings({ chargeStrengthOrphan: -300 });

    const tightRadius = graphNodePairRepulsionRadius(tight, "normal", true, true);
    const looseRadius = graphNodePairRepulsionRadius(loose, "normal", true, true);

    expect(looseRadius).toBeGreaterThan(tightRadius);
  });

  it("keeps default spacing scale neutral", () => {
    expect(graphNodeSpacingScale(GRAPH_SETTINGS_DEFAULTS, "linked")).toBe(1);
    expect(graphNodeSpacingScale(GRAPH_SETTINGS_DEFAULTS, "orphan")).toBe(1);
  });
});
