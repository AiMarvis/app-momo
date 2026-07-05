/**
 * System font fallback stacks appended to every `--font-*` CSS custom property.
 * Shared across static CSS defaults, Settings reactive effects, and the font registry.
 */

const FONT_SANS_FALLBACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif';

const FONT_SANS_JA_FALLBACK =
  '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "Noto Sans JP", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif';

const FONT_MONO_FALLBACK =
  '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace';

const DEFAULT_JA_SANS = "Hiragino Sans";

/**
 * Build a CSS `font-family` value with "Emoji" prefix, an optional user font,
 * and the appropriate fallback stack.
 *
 * When `fontName` is empty or whitespace-only the entry is omitted entirely so
 * the browser falls through to the fallback fonts instead of trying to resolve
 * an empty `""` family name.
 */
function buildFontFamily(fontName: string, fallback: string): string {
  const trimmed = fontName.trim();
  return trimmed ? `"Emoji", "${trimmed}", ${fallback}` : `"Emoji", ${fallback}`;
}

function buildMonoFontFamily(fontName: string): string {
  const trimmed = fontName.trim();
  // Keep emoji after mono so ASCII punctuation like code fences uses the mono face.
  return trimmed
    ? `"${trimmed}", ${FONT_MONO_FALLBACK}, "Emoji"`
    : `${FONT_MONO_FALLBACK}, "Emoji"`;
}

function resolveLocaleSansFontName(fontName: string, locale: "en" | "ko" | "ja"): string {
  const trimmed = fontName.trim();

  // For Japanese UI/editor defaults, avoid Goorm Sans as primary because it
  // lacks enough JP glyph coverage and causes visible fallback mixing.
  if (locale === "ja" && (trimmed === "" || trimmed.toLowerCase() === "goorm sans")) {
    return DEFAULT_JA_SANS;
  }

  return trimmed;
}

export {
  FONT_SANS_FALLBACK,
  FONT_SANS_JA_FALLBACK,
  FONT_MONO_FALLBACK,
  buildFontFamily,
  buildMonoFontFamily,
  resolveLocaleSansFontName,
};
