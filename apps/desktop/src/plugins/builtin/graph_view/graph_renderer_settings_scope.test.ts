/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

describe("graph renderer settings scopes", () => {
  it("keeps the 2D renderer on the 2D settings scope", () => {
    const canvasSource = source("graph_canvas_pixi.tsx");

    expect(canvasSource).toContain("getGraphSettings()");
    expect(canvasSource).not.toContain('getGraphSettings("3d")');
  });

  it("keeps the 3D renderer on the 3D settings scope", () => {
    const canvasSource = source("graph_canvas_3d.tsx");

    expect(canvasSource).toContain('getGraphSettings("3d")');
    expect(canvasSource).not.toContain("getGraphSettings()");
  });
});
