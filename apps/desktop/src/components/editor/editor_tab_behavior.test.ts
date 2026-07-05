import { describe, expect, it } from "vitest";

import { isStructuralTabTargetNodeName } from "./editor_tab_behavior";

describe("editor tab behavior", () => {
  it("defers tab handling to structural table and list keymaps", () => {
    expect(isStructuralTabTargetNodeName("list")).toBe(true);
    expect(isStructuralTabTargetNodeName("tableCell")).toBe(true);
    expect(isStructuralTabTargetNodeName("tableHeaderCell")).toBe(true);
  });

  it("does not treat the old header-cell name as structural", () => {
    expect(isStructuralTabTargetNodeName("tableHeader")).toBe(false);
    expect(isStructuralTabTargetNodeName("paragraph")).toBe(false);
  });
});
