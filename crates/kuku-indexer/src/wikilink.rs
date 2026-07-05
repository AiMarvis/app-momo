use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ExtractedWikilink {
    pub target: String,
    pub alias: Option<String>,
    pub ordinal: usize,
}

pub fn extract_wikilinks(markdown: &str) -> Vec<ExtractedWikilink> {
    let sanitized = mask_code_regions(markdown);
    scan_text_for_wikilinks(&sanitized)
        .into_iter()
        .enumerate()
        .map(|(ordinal, (target, alias))| ExtractedWikilink {
            target,
            alias,
            ordinal,
        })
        .collect()
}

fn mask_code_regions(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut output = String::with_capacity(input.len());
    let mut idx = 0usize;

    while idx < chars.len() {
        if let Some((fence_char, fence_len)) = detect_fence_start(&chars, idx) {
            idx = mask_fenced_block(&chars, idx, fence_char, fence_len, &mut output);
            continue;
        }

        if chars[idx] == '`' {
            let run_len = count_run(&chars, idx, '`');
            if let Some(end) = find_backtick_run(&chars, idx + run_len, run_len) {
                for ch in &chars[idx..end + run_len] {
                    output.push(mask_char(*ch));
                }
                idx = end + run_len;
                continue;
            }
        }

        output.push(chars[idx]);
        idx += 1;
    }

    output
}

fn detect_fence_start(chars: &[char], idx: usize) -> Option<(char, usize)> {
    let ch = *chars.get(idx)?;
    if ch != '`' && ch != '~' {
        return None;
    }
    let line_start = idx == 0 || chars.get(idx.wrapping_sub(1)) == Some(&'\n');
    if !line_start {
        return None;
    }

    let run_len = count_run(chars, idx, ch);
    if run_len < 3 {
        return None;
    }

    Some((ch, run_len))
}

fn mask_fenced_block(
    chars: &[char],
    start: usize,
    fence_char: char,
    fence_len: usize,
    output: &mut String,
) -> usize {
    let mut idx = start;
    while idx < chars.len() {
        let line_start = idx == 0 || chars.get(idx.wrapping_sub(1)) == Some(&'\n');
        if idx != start && line_start && count_run(chars, idx, fence_char) >= fence_len {
            while idx < chars.len() {
                let ch = chars[idx];
                output.push(mask_char(ch));
                idx += 1;
                if ch == '\n' {
                    break;
                }
            }
            return idx;
        }

        let ch = chars[idx];
        output.push(mask_char(ch));
        idx += 1;
    }

    idx
}

fn count_run(chars: &[char], start: usize, needle: char) -> usize {
    let mut count = 0usize;
    let mut idx = start;
    while chars.get(idx) == Some(&needle) {
        count += 1;
        idx += 1;
    }
    count
}

fn find_backtick_run(chars: &[char], start: usize, run_len: usize) -> Option<usize> {
    let mut idx = start;
    while idx < chars.len() {
        if chars[idx] == '`' && count_run(chars, idx, '`') >= run_len {
            return Some(idx);
        }
        idx += 1;
    }
    None
}

fn mask_char(ch: char) -> char {
    if ch == '\n' || ch == '\r' { ch } else { ' ' }
}

fn scan_text_for_wikilinks(input: &str) -> Vec<(String, Option<String>)> {
    let chars: Vec<char> = input.chars().collect();
    let mut idx = 0usize;
    let mut results = Vec::new();

    while idx + 1 < chars.len() {
        if chars[idx] != '[' || chars[idx + 1] != '[' {
            idx += 1;
            continue;
        }

        let start = idx + 2;
        let mut cursor = start;
        let mut separator = None;
        let mut invalid = false;

        while cursor + 1 < chars.len() {
            if chars[cursor] == '\n' || chars[cursor] == '\r' {
                invalid = true;
                break;
            }

            if chars[cursor] == '|' && separator.is_none() {
                separator = Some(cursor);
                cursor += 1;
                continue;
            }

            if chars[cursor] == ']' && chars[cursor + 1] == ']' {
                let target_end = separator.unwrap_or(cursor);
                let alias_start = separator.map(|pos| pos + 1);
                let target = chars[start..target_end].iter().collect::<String>();
                let alias = alias_start.map(|from| chars[from..cursor].iter().collect::<String>());
                if let Some((target, alias)) = finalize_candidate(target, alias) {
                    results.push((target, alias));
                }
                idx = cursor + 2;
                break;
            }

            cursor += 1;
        }

        if invalid || cursor + 1 >= chars.len() {
            idx += 2;
        }
    }

    results
}

fn finalize_candidate(target: String, alias: Option<String>) -> Option<(String, Option<String>)> {
    let normalized_target = target.trim();
    if normalized_target.is_empty() {
        return None;
    }

    let had_alias = alias.is_some();
    let normalized_alias = alias
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if had_alias && normalized_alias.is_none() {
        return None;
    }

    Some((normalized_target.to_string(), normalized_alias))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_basic_targets_and_aliases() {
        let links = extract_wikilinks("See [[Alpha]] and [[Beta|Display]].");
        assert_eq!(
            links,
            vec![
                ExtractedWikilink {
                    target: "Alpha".to_string(),
                    alias: None,
                    ordinal: 0,
                },
                ExtractedWikilink {
                    target: "Beta".to_string(),
                    alias: Some("Display".to_string()),
                    ordinal: 1,
                },
            ]
        );
    }

    #[test]
    fn rejects_invalid_and_multiline_links() {
        let links = extract_wikilinks("[[]] [[|alias]] [[target|]] [[broken\nlink]] [[open");
        assert!(links.is_empty());
    }

    #[test]
    fn ignores_code_spans_and_code_blocks() {
        let markdown = "`[[InlineCode]]`\n\n```\n[[CodeBlock]]\n```\n\n[[Real]]";
        let links = extract_wikilinks(markdown);
        assert_eq!(
            links,
            vec![ExtractedWikilink {
                target: "Real".to_string(),
                alias: None,
                ordinal: 0,
            }]
        );
    }
}
