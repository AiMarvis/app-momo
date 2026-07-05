// @vitest-environment jsdom

import { createRoot } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const windowApi = vi.hoisted(() => ({
  failCurrentWindow: false,
  setTheme: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => {
    if (windowApi.failCurrentWindow) {
      throw new TypeError("Cannot read properties of undefined (reading 'metadata')");
    }
    return { setTheme: windowApi.setTheme };
  },
}));

function installMatchMedia(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList => {
      const target = new EventTarget();
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: target.addEventListener.bind(target),
        removeEventListener: target.removeEventListener.bind(target),
        dispatchEvent: target.dispatchEvent.bind(target),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      };
    },
  });
}

function noop(): void {}

async function loadThemeModule() {
  vi.resetModules();
  return import("~/stores/theme");
}

describe("theme initialization", () => {
  beforeEach(() => {
    windowApi.failCurrentWindow = false;
    windowApi.setTheme.mockClear();
    installMatchMedia(false);
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("style");
    document.body.removeAttribute("style");
  });

  it("keeps DOM theme initialization when Tauri window metadata is unavailable", async () => {
    windowApi.failCurrentWindow = true;
    const { initTheme } = await loadThemeModule();
    let dispose = noop;

    expect(() => {
      dispose = createRoot((rootDispose) => {
        initTheme();
        return rootDispose;
      });
    }).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(windowApi.setTheme).not.toHaveBeenCalled();
    dispose();
  });
});
