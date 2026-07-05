/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("sync plugin metadata", () => {
  it("allows Sync to be disabled while keeping it enabled by default", () => {
    const source = readFileSync(resolve(__dirname, "index.ts"), "utf8");
    const settingsSource = readFileSync(resolve(__dirname, "../../../stores/settings.ts"), "utf8");

    expect(source).toContain('id: "core-sync"');
    expect(source).toContain('version: "0.1.0-alpha"');
    expect(source).toContain("canDisable: true");
    expect(settingsSource).not.toContain('"core-sync"');
  });
});
