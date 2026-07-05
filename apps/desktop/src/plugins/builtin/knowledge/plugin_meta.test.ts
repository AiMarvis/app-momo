/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("knowledge plugin metadata", () => {
  it("allows Second Brain to be disabled from plugin settings", () => {
    const source = readFileSync(resolve(__dirname, "index.ts"), "utf8");

    expect(source).toContain('id: "knowledge"');
    expect(source).toContain('version: "0.1.0-alpha"');
    expect(source).toContain("canDisable: true");
  });
});
