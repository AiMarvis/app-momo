use crate::normalize::normalize_text;

const SNIPPET_RADIUS: usize = 80;

pub fn build_snippet(raw_text: &str, query: &str) -> String {
    let trimmed = raw_text.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let raw_chars: Vec<char> = trimmed.chars().collect();
    let normalized_query = normalize_text(query);
    if normalized_query.is_empty() {
        return raw_chars.iter().take(SNIPPET_RADIUS * 2).collect();
    }

    let lowered = trimmed.to_lowercase();
    if let Some(byte_idx) = lowered.find(&normalized_query) {
        let prefix_chars = lowered[..byte_idx].chars().count();
        let start = prefix_chars.saturating_sub(SNIPPET_RADIUS);
        let end = usize::min(
            prefix_chars + normalized_query.chars().count() + SNIPPET_RADIUS,
            raw_chars.len(),
        );
        let mut snippet: String = raw_chars[start..end].iter().collect();
        if start > 0 {
            snippet = format!("…{snippet}");
        }
        if end < raw_chars.len() {
            snippet.push('…');
        }
        return snippet;
    }

    let mut snippet: String = raw_chars.iter().take(SNIPPET_RADIUS * 2).collect();
    if raw_chars.len() > SNIPPET_RADIUS * 2 {
        snippet.push('…');
    }
    snippet
}

fn snap_to_char_boundary(text: &str, mut byte: usize) -> usize {
    while byte > 0 && !text.is_char_boundary(byte) {
        byte -= 1;
    }
    byte
}

pub fn build_snippet_for_range(raw_text: &str, start_byte: usize, end_byte: usize) -> String {
    let trimmed = raw_text.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let raw_chars: Vec<char> = trimmed.chars().collect();
    let clamped_start = snap_to_char_boundary(trimmed, usize::min(start_byte, trimmed.len()));
    let clamped_end = snap_to_char_boundary(
        trimmed,
        usize::min(usize::max(end_byte, clamped_start), trimmed.len()),
    );
    let start = trimmed[..clamped_start].chars().count();
    let end = trimmed[..clamped_end].chars().count();
    let snippet_start = start.saturating_sub(SNIPPET_RADIUS);
    let snippet_end = usize::min(end + SNIPPET_RADIUS, raw_chars.len());

    let mut snippet: String = raw_chars[snippet_start..snippet_end].iter().collect();
    if snippet_start > 0 {
        snippet = format!("…{snippet}");
    }
    if snippet_end < raw_chars.len() {
        snippet.push('…');
    }
    snippet
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snippet_preserves_raw_text_boundaries() {
        let raw = "0123456789 abcdefghijklmnopqrstuvwxyz";
        let snippet = build_snippet(raw, "def");
        assert!(snippet.contains("def"));
        assert!(!snippet.contains('\n'));
    }

    #[test]
    fn range_snippet_uses_match_window() {
        let raw = "prefix alpha beta gamma suffix";
        let start = raw.find("beta").unwrap();
        let end = start + "beta".len();
        let snippet = build_snippet_for_range(raw, start, end);
        assert!(snippet.contains("beta"));
        assert!(snippet.contains("alpha"));
    }

    #[test]
    fn range_snippet_handles_non_boundary_bytes() {
        let raw = "한글abc한글";
        let snippet = build_snippet_for_range(raw, 1, 5);
        assert!(!snippet.is_empty());
    }
}
