// ── App Paths ──
//
// Resolves and caches the ~/.kuku app root directory path.
// Must be initialized once at bootstrap before any plugin code runs.
//
// Usage:
//   await initAppPaths();           // call once at app startup
//   const root = getAppRoot();      // sync access after init
//   const dir = getPluginDataDir('graph-view');

import { invoke } from "@tauri-apps/api/core";

// ── State ──

let appRoot: string | null = null;

// ── Init ──

/**
 * Resolve ~/.kuku and ensure the directory structure exists.
 * Must be called once during app bootstrap, before any plugin activation.
 *
 * Delegates to Rust `plugin_ensure_root_dirs` which:
 * 1. Creates ~/.kuku/ and ~/.kuku/plugins/ if they don't exist
 * 2. Returns the resolved absolute path to ~/.kuku
 */
async function initAppPaths(): Promise<void> {
  if (appRoot !== null) return; // idempotent
  appRoot = await invoke<string>("plugin_ensure_root_dirs");
}

// ── Getters ──

/**
 * Get the app root directory path (~/.kuku).
 * Throws if called before initAppPaths().
 */
function getAppRoot(): string {
  if (appRoot === null) {
    throw new Error("App paths not initialized. Call initAppPaths() first.");
  }
  return appRoot;
}

/**
 * Get the data directory path for a specific plugin.
 * ~/.kuku/plugins/{pluginId}
 */
function getPluginDataDir(pluginId: string): string {
  return `${getAppRoot()}/plugins/${pluginId}`;
}

/**
 * Get the settings file path for a specific plugin.
 * ~/.kuku/plugins/{pluginId}/settings.json
 */
function getPluginSettingsPath(pluginId: string): string {
  return `${getPluginDataDir(pluginId)}/settings.json`;
}

// ── Exports ──

export { getAppRoot, getPluginDataDir, getPluginSettingsPath, initAppPaths };
