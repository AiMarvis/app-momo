// ── Typography Plugin ──
//
// Provides typographic ligatures for the editor.
// Visually replaces common character sequences with their Unicode
// equivalents (e.g. `->` renders as `→`, `--` renders as `—`)
// without modifying the underlying document content.
//
// All ligatures are hidden inside code blocks and inline code.
// When the cursor enters a ligature region, the original text
// is revealed for editing.

import type { KukuPlugin } from "~/plugins/types";

import { defineTypographicLigatures } from "./rules";

// ── Plugin Definition ──

const typographyPlugin: KukuPlugin = {
  id: "typography",
  name: "Typography",
  version: "0.2.0",
  description: "Visual ligatures for common sequences (→ ← ⇒ — … and more)",
  canDisable: true,

  // ── Editor Contribution ──
  editor: {
    extension: defineTypographicLigatures,
  },
};

// ── Exports ──

export { typographyPlugin };
