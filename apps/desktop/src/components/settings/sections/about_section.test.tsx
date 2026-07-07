import { renderToString } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(() => Promise.resolve("0.6.3")),
}));

vi.mock("~/stores/updater", () => ({
  updaterState: { status: "idle", version: null, progress: 0, errorMessage: null },
  checkForUpdates: vi.fn(() => Promise.resolve()),
  downloadAndInstall: vi.fn(() => Promise.resolve()),
  restart: vi.fn(() => Promise.resolve()),
}));

describe("AboutSection", () => {
  it("shows a manual update check action", async () => {
    const { AboutSection } = await import("./about_section");

    const html = renderToString(() => <AboutSection />);

    expect(html).toContain("Updates");
    expect(html).toContain("Check for updates");
  });
});
