import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

class StorageMock {
  readonly #store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#store.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.#store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#store.set(key, value);
  }
}

function installBrowserGlobals(): StorageMock {
  const storage = new StorageMock();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  return storage;
}

async function loadSettingsModule() {
  vi.resetModules();
  return import("~/stores/settings");
}

describe("settings store plugin defaults", () => {
  beforeEach(() => {
    installBrowserGlobals();
    mockInvoke.mockReset();
  });

  it("defaults Second Brain to enabled", async () => {
    const { settingsState } = await loadSettingsModule();

    expect(settingsState.disabledPlugins).not.toContain("knowledge");
    expect(settingsState.general.projectIssueLanguage).toBe("system");
  });

  it("does not reenable Second Brain when persisted settings keep it disabled", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "app_settings_get") {
        return {
          disabled_plugins: ["voxel-graph", "knowledge"],
          disabled_plugin_defaults_applied: ["voxel-graph", "knowledge"],
        };
      }
      if (command === "app_settings_set") return undefined;
      throw new Error(`unexpected invoke: ${command}`);
    });

    const { initSettings, settingsState } = await loadSettingsModule();

    await initSettings();

    expect(settingsState.disabledPlugins).toEqual(["voxel-graph", "knowledge"]);
    expect(settingsState.disabledPluginDefaultsApplied).toEqual(["voxel-graph", "knowledge"]);
    expect(mockInvoke).not.toHaveBeenCalledWith("app_settings_set", expect.anything());
  });

  it("loads the persisted Project OS issue language", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "app_settings_get") {
        return {
          general: {
            project_issue_language: "ko",
          },
        };
      }
      if (command === "app_settings_set") return undefined;
      throw new Error(`unexpected invoke: ${command}`);
    });

    const { initSettings, settingsState } = await loadSettingsModule();

    await initSettings();

    expect(settingsState.general.projectIssueLanguage).toBe("ko");
  });
});
