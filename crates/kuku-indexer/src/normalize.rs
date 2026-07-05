use std::sync::LazyLock;

use regex::Regex;

static WHITESPACE_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\s+").expect("valid whitespace regex"));

pub fn normalize_text(input: &str) -> String {
    WHITESPACE_REGEX
        .replace_all(input.trim(), " ")
        .to_lowercase()
}

pub fn is_cjk_char(ch: char) -> bool {
    matches!(
        ch as u32,
        0x2E80..=0x9FFF | 0xAC00..=0xD7AF | 0xF900..=0xFAFF | 0x20000..=0x2FA1F
    )
}

pub fn contains_cjk(input: &str) -> bool {
    input.chars().any(is_cjk_char)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_collapses_whitespace_and_lowercases() {
        assert_eq!(normalize_text(" Hello\tWorld \nKuku "), "hello world kuku");
    }

    #[test]
    fn detects_cjk() {
        assert!(contains_cjk("검색"));
        assert!(!contains_cjk("search"));
    }
}
