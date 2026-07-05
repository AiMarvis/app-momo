pub const CHUNK_MAX_CHARS: usize = 1000;
pub const CHUNK_OVERLAP_CHARS: usize = 100;
const TARGET_SPLIT_CHARS: usize = 850;

fn is_boundary(ch: char) -> bool {
    matches!(ch, '\n' | '.' | '!' | '?' | '。' | '！' | '？')
}

pub fn split_chunk_text(input: &str) -> Vec<String> {
    let chars: Vec<char> = input.chars().collect();
    if chars.len() <= CHUNK_MAX_CHARS {
        return vec![input.trim().to_string()];
    }

    let mut parts = Vec::new();
    let mut start = 0usize;
    while start < chars.len() {
        let upper = usize::min(start + CHUNK_MAX_CHARS, chars.len());
        let mut end = upper;

        if upper < chars.len() {
            let target = usize::min(start + TARGET_SPLIT_CHARS, upper);
            let mut boundary = None;
            for idx in (target..upper).rev() {
                if is_boundary(chars[idx - 1]) {
                    boundary = Some(idx);
                    break;
                }
            }
            if boundary.is_none() {
                let fallback_start =
                    usize::min(start.saturating_add(CHUNK_OVERLAP_CHARS + 1), target);
                for idx in (fallback_start..target).rev() {
                    if is_boundary(chars[idx - 1]) {
                        boundary = Some(idx);
                        break;
                    }
                }
            }
            if let Some(idx) = boundary {
                end = idx;
            }
        }

        let text: String = chars[start..end].iter().collect();
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            parts.push(trimmed.to_string());
        }

        if end == chars.len() {
            break;
        }

        let next = end.saturating_sub(CHUNK_OVERLAP_CHARS);
        start = if next <= start { end } else { next };
    }

    parts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oversize_block_splits_with_overlap() {
        let input = "a".repeat(CHUNK_MAX_CHARS + 250);
        let parts = split_chunk_text(&input);
        assert!(parts.len() >= 2);
        assert!(parts.iter().all(|part| !part.is_empty()));
    }

    #[test]
    fn early_sentence_boundary_still_progresses() {
        let input = format!("Short. {}", "a".repeat(CHUNK_MAX_CHARS + 250));
        let parts = split_chunk_text(&input);

        assert!(parts.len() < 10);
        assert!(parts[0].chars().count() > CHUNK_OVERLAP_CHARS);
        assert!(parts.iter().all(|part| !part.is_empty()));
    }

    #[test]
    fn early_code_language_boundary_still_progresses() {
        let input = format!("rust\n{}", "a".repeat(CHUNK_MAX_CHARS + 250));
        let parts = split_chunk_text(&input);

        assert!(parts.len() < 10);
        assert!(parts[0].chars().count() > CHUNK_OVERLAP_CHARS);
        assert!(parts.iter().all(|part| !part.is_empty()));
    }

    #[test]
    fn overlap_sized_boundary_still_progresses() {
        let input = format!(
            "{}.{}",
            "a".repeat(CHUNK_OVERLAP_CHARS - 1),
            "b".repeat(CHUNK_MAX_CHARS + 250)
        );
        let parts = split_chunk_text(&input);

        assert!(parts.len() < 10);
        assert!(parts[0].chars().count() > CHUNK_OVERLAP_CHARS);
        assert!(parts.iter().all(|part| !part.is_empty()));
    }

    #[test]
    fn early_cjk_boundary_still_progresses() {
        let input = format!("短い。{}", "a".repeat(CHUNK_MAX_CHARS + 250));
        let parts = split_chunk_text(&input);

        assert!(parts.len() < 10);
        assert!(parts[0].chars().count() > CHUNK_OVERLAP_CHARS);
        assert!(parts.iter().all(|part| !part.is_empty()));
    }
}
