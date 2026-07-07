use std::path::Path;

use crate::project_os::{is_second_brain_root_name, looks_secret};

pub(super) fn parse_status_short(output: &str) -> Result<(Vec<String>, Vec<String>), ()> {
    let mut lines = Vec::new();
    let mut paths = Vec::new();
    for line in output.lines().filter(|line| !line.trim().is_empty()) {
        if line.len() < 4 {
            return Err(());
        }
        lines.push(line.to_string());
        for path in parse_status_short_paths(line[3..].trim())? {
            push_unique(&mut paths, path);
        }
    }
    Ok((lines, paths))
}

pub(super) fn parse_name_status(output: &str) -> Result<(Vec<String>, Vec<String>), ()> {
    let mut lines = Vec::new();
    let mut paths = Vec::new();
    for line in output.lines().filter(|line| !line.trim().is_empty()) {
        let mut parts = line.split('\t');
        let Some(status) = parts.next() else {
            return Err(());
        };
        if status.is_empty() {
            return Err(());
        }
        let mut found_path = false;
        for path in parts {
            found_path = true;
            git_relative_path_is_safe(path)?;
            push_unique(&mut paths, path.to_string());
        }
        if !found_path {
            return Err(());
        }
        lines.push(line.to_string());
    }
    Ok((lines, paths))
}

pub(super) fn parse_diff_stat(output: &str) -> Result<Vec<String>, ()> {
    let mut lines = Vec::new();
    for line in output.lines().filter(|line| !line.trim().is_empty()) {
        if let Some((path, _)) = line.split_once(" | ") {
            git_diff_stat_path_is_safe(path.trim())?;
        } else if !line.contains("changed") {
            return Err(());
        }
        lines.push(line.to_string());
    }
    Ok(lines)
}

pub(super) fn parse_log_oneline(output: &str) -> Result<Vec<String>, ()> {
    let mut lines = Vec::new();
    for line in output.lines().filter(|line| !line.trim().is_empty()) {
        if line.contains('\0') {
            return Err(());
        }
        lines.push(line.to_string());
    }
    Ok(lines)
}

pub(super) fn push_unique(paths: &mut Vec<String>, path: String) {
    if !paths.iter().any(|existing| existing == &path) {
        paths.push(path);
    }
}

pub(super) fn git_commit_is_safe(value: &str) -> bool {
    (7..=64).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

pub(super) fn git_relative_path_is_safe(path: &str) -> Result<(), ()> {
    if path.is_empty()
        || path.contains('\0')
        || path.contains('\\')
        || path.contains(" -> ")
        || path.contains("=>")
        || Path::new(path).is_absolute()
    {
        return Err(());
    }
    validate_project_relative_segments(path)
}

pub(super) fn git_diff_stat_path_is_safe(path: &str) -> Result<(), ()> {
    if path.is_empty()
        || path.contains('\0')
        || path.contains('\\')
        || Path::new(path).is_absolute()
    {
        return Err(());
    }
    validate_project_relative_segments(path)
}

fn parse_status_short_paths(path: &str) -> Result<Vec<String>, ()> {
    if let Some((old_path, new_path)) = path.split_once(" -> ") {
        git_relative_path_is_safe(old_path)?;
        git_relative_path_is_safe(new_path)?;
        return Ok(vec![old_path.to_string(), new_path.to_string()]);
    }
    git_relative_path_is_safe(path)?;
    Ok(vec![path.to_string()])
}

fn validate_project_relative_segments(path: &str) -> Result<(), ()> {
    for segment in path.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(());
        }
        if looks_secret(&segment.to_ascii_lowercase()) {
            return Err(());
        }
        for token in segment.split(|ch: char| {
            ch.is_whitespace() || matches!(ch, '{' | '}' | '[' | ']' | '(' | ')' | '=' | '>')
        }) {
            if token == "."
                || token == ".."
                || is_second_brain_root_name(token)
                || looks_secret(&token.to_ascii_lowercase())
            {
                return Err(());
            }
        }
    }
    Ok(())
}
