import { describe, expect, it } from "vitest";

import { shouldBlockRemotePermission } from "./chat_panel_permissions";

describe("chat panel permission gate", () => {
  it("does not block Codex-ready chat behind legacy remote auth", () => {
    expect(
      shouldBlockRemotePermission({
        codexReady: true,
        provider: "remote",
        configLoading: false,
        authenticated: true,
        pluginAuthorized: false,
      }),
    ).toBe(false);
  });

  it("still blocks legacy remote chat without plugin authorization", () => {
    expect(
      shouldBlockRemotePermission({
        codexReady: false,
        provider: "remote",
        configLoading: false,
        authenticated: true,
        pluginAuthorized: false,
      }),
    ).toBe(true);
  });
});
