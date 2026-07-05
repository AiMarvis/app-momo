/**
 * Wikilink Suggest — file list helpers for `[[` autocompletion.
 *
 * Flattens the vault file tree into a searchable list of markdown files
 * and provides query-based filtering for the suggestion menu.
 */

import type { FileEntry } from "~/lib/vault_fs";

// ── Types ───────────────────────────────────────────────────────────

export interface WikilinkSuggestItem {
  /** Display name (filename without `.md` extension). */
  name: string;
  /** Vault-relative path (e.g. `"notes/daily/2024-01-01.md"`). */
  path: string;
  /** Parent folder path (e.g. `"notes/daily"`). Empty string for root files. */
  folder: string;
}

// ── Flatten ─────────────────────────────────────────────────────────

/**
 * Recursively flatten a vault `FileEntry[]` tree into a flat list of
 * markdown files suitable for wikilink suggestions.
 *
 * Only `.md` files are included; directories are traversed but not emitted.
 */
export function flattenMarkdownFiles(entries: FileEntry[]): WikilinkSuggestItem[] {
  const result: WikilinkSuggestItem[] = [];

  function visit(nodes: FileEntry[]): void {
    for (const entry of nodes) {
      if (entry.is_directory) {
        if (entry.children) visit(entry.children);
      } else if (entry.name.endsWith(".md")) {
        const name = entry.name.slice(0, -3);
        const lastSlash = entry.path.lastIndexOf("/");
        const folder = lastSlash !== -1 ? entry.path.slice(0, lastSlash) : "";
        result.push({ name, path: entry.path, folder });
      }
    }
  }

  visit(entries);
  return result;
}

// ── Filter ──────────────────────────────────────────────────────────

/**
 * Filter wikilink suggestions by a user-typed query string.
 *
 * - Excludes the currently-open file (to avoid self-links).
 * - When `query` is empty, returns all remaining items.
 * - Matching is case-insensitive against both the file name and full path.
 * - Results are scored so that name-prefix matches rank above substring
 *   matches, and shorter names rank above longer ones for the same match kind.
 */
export function filterWikilinkSuggestions(
  items: WikilinkSuggestItem[],
  query: string,
  currentFilePath?: string,
): WikilinkSuggestItem[] {
  const candidates = currentFilePath
    ? items.filter((item) => item.path !== currentFilePath)
    : items;

  if (!query) return candidates;

  const normalized = query.toLowerCase();

  interface Scored {
    item: WikilinkSuggestItem;
    score: number;
  }

  const scored: Scored[] = [];

  for (const item of candidates) {
    const nameLower = item.name.toLowerCase();
    const pathLower = item.path.toLowerCase();

    if (nameLower.startsWith(normalized)) {
      // Name prefix match — best tier. Shorter names rank higher.
      scored.push({ item, score: 100 - Math.min(item.name.length, 99) });
    } else if (nameLower.includes(normalized)) {
      // Name substring match — second tier.
      scored.push({ item, score: 50 - Math.min(item.name.length, 49) });
    } else if (pathLower.includes(normalized)) {
      // Path substring match — third tier.
      scored.push({ item, score: 0 });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
