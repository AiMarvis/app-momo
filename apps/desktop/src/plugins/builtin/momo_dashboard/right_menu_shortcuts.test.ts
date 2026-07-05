import { beforeEach, describe, expect, it, vi } from "vitest";

class StorageMock {
  readonly #store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#store.set(key, value);
  }
}

function installBrowserGlobals(): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: vi.fn(),
      innerWidth: 1440,
      innerHeight: 900,
      removeEventListener: vi.fn(),
    },
  });

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new StorageMock(),
  });
}

async function loadShortcutsModule() {
  vi.resetModules();
  return import("./right_menu_shortcuts");
}

describe("right menu shortcuts", () => {
  beforeEach(() => {
    installBrowserGlobals();
  });

  it("starts with no copied top navigation shortcuts", async () => {
    const shortcuts = await loadShortcutsModule();

    expect(shortcuts.rightMenuSurfaceIds()).toEqual([]);
    expect(shortcuts.rightMenuSurfaces()).toEqual([]);
  });

  it("moves dropped top navigation surfaces into the right menu order", async () => {
    const shortcuts = await loadShortcutsModule();

    shortcuts.placeRightMenuSurface("ai-chat", null);
    expect(shortcuts.rightMenuSurfaceIds()).toEqual(["ai-chat"]);

    shortcuts.placeRightMenuSurface("today", null);
    expect(shortcuts.rightMenuSurfaceIds()).toEqual(["ai-chat", "today"]);

    shortcuts.placeRightMenuSurface("search", "ai-chat");
    expect(shortcuts.rightMenuSurfaceIds()).toEqual(["search", "ai-chat", "today"]);
  });

  it("tracks pointer drag state for Tauri WebView drops", async () => {
    const shortcuts = await loadShortcutsModule();

    shortcuts.startMomoSurfacePointerDrag("ai-chat");

    expect(shortcuts.readMomoSurfacePointerDrag()).toBe("ai-chat");
    expect(shortcuts.parseMomoOperationSurfaceId("calendar")).toBeNull();
    expect(shortcuts.parseMomoOperationSurfaceId("search")).toBe("search");

    shortcuts.clearMomoSurfacePointerDrag();
    expect(shortcuts.readMomoSurfacePointerDrag()).toBeNull();
  });
});
