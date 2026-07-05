import { getCurrentWindow } from "@tauri-apps/api/window";
import { createEffect, createSignal } from "solid-js";

import {
  setAppearanceSetting,
  settingsState,
  type EffectiveTheme,
  type ThemePreference,
} from "~/stores/settings";

// ── System dark mode detection (module-level, app lifetime) ──

const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
const [systemIsDark, setSystemIsDark] = createSignal(mediaQuery.matches);
mediaQuery.addEventListener("change", (e: MediaQueryListEvent) => setSystemIsDark(e.matches));

// ── Constants ──

const BG_COLORS: Record<EffectiveTheme, string> = {
  dark: "#1a1a1a",
  light: "#ffffff",
};

// ── Helpers ──

/**
 * Resolves the effective theme from the stored preference + system detection.
 * Plain function — safe to call inside or outside reactive contexts.
 */
function getEffectiveTheme(): EffectiveTheme {
  const pref = settingsState.appearance.theme;
  if (pref === "system") return systemIsDark() ? "dark" : "light";
  return pref;
}

/** Apply theme tokens + bg color to the DOM. */
function applyToDom(theme: EffectiveTheme): void {
  const color = BG_COLORS[theme];

  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }

  document.documentElement.style.backgroundColor = color;
  document.documentElement.style.colorScheme = theme;
  document.body.style.backgroundColor = color;

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = color;
}

// ── Actions ──

function setTheme(theme: ThemePreference): void {
  setAppearanceSetting("theme", theme);
}

function toggleTheme(): void {
  setTheme(getEffectiveTheme() === "dark" ? "light" : "dark");
}

function currentWindowOrNull(): ReturnType<typeof getCurrentWindow> | null {
  try {
    return getCurrentWindow();
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

function applyCurrentTheme(win: ReturnType<typeof getCurrentWindow> | null): void {
  const theme = getEffectiveTheme();
  applyToDom(theme);

  // Sync native Tauri window theme.
  // null = follow OS; explicit value = lock the window chrome color.
  const pref = settingsState.appearance.theme;
  if (win) void win.setTheme(pref === "system" ? null : pref);
}

// ── Init ──

/**
 * Sets up a reactive effect that applies the theme to the DOM and native window
 * whenever the preference or system setting changes.
 *
 * Must be called inside a reactive root (e.g. directly in the App component body).
 */
function initTheme(): void {
  const win = currentWindowOrNull();

  applyCurrentTheme(win);
  createEffect(() => applyCurrentTheme(win));
}

// ── Exports ──

export { getEffectiveTheme, initTheme, setTheme, toggleTheme };
