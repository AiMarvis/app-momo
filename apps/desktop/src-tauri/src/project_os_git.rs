use std::fs;
use std::path::Path;
use std::process::Command;

use serde::Serialize;
use tauri::command;

use crate::project_os::{SECOND_BRAIN_ROOT_NAMES, canonical_project_root};

#[path = "project_os_git_parse.rs"]
mod parse;

#[cfg(test)]
#[path = "project_os_git_safety_tests.rs"]
mod safety_tests;
#[cfg(test)]
#[path = "project_os_git_summary_tests.rs"]
mod summary_tests;
#[cfg(test)]
#[path = "project_os_git_test_support.rs"]
mod test_support;

use parse::{
    git_commit_is_safe, parse_diff_stat, parse_log_oneline, parse_name_status, parse_status_short,
    push_unique,
};

const SAFE_GIT_CONFIG: &[(&str, &str)] = &[
    ("core.fsmonitor", "false"),
    ("core.quotepath", "false"),
    ("diff.external", ""),
];
const PROJECT_PATHSPEC: &str = ".";

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectOsGitSummaryStatus {
    Ready,
    NotGit,
    NotRepoRoot,
    Failed,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOsGitSummary {
    pub status: ProjectOsGitSummaryStatus,
    pub head: Option<String>,
    pub previous_commit: Option<String>,
    pub range: Option<String>,
    pub changed_paths: Vec<String>,
    pub status_short: Vec<String>,
    pub diff_name_status: Vec<String>,
    pub diff_stat: Vec<String>,
    pub log_oneline: Vec<String>,
    pub message: Option<String>,
}

#[command]
pub async fn project_os_git_summary(
    path: String,
    previous_commit: Option<String>,
) -> Result<ProjectOsGitSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_project_git_summary(&path, previous_commit.as_deref())
    })
    .await
    .map_err(|error| format!("Failed to read project Git summary: {error}"))?
}

fn read_project_git_summary(
    path: &str,
    previous_commit: Option<&str>,
) -> Result<ProjectOsGitSummary, String> {
    let root = canonical_project_root(path)?;
    Ok(project_git_summary_for_root(
        &root,
        previous_commit,
        |args| run_git_command(&root, args),
    ))
}

fn project_git_summary_for_root<F>(
    root: &Path,
    previous_commit: Option<&str>,
    mut run_git: F,
) -> ProjectOsGitSummary
where
    F: FnMut(&[String]) -> Result<String, String>,
{
    let top_level = match run_git(&git_args(&["rev-parse", "--show-toplevel"])) {
        Ok(value) => value,
        Err(_) => {
            return git_summary_status(
                ProjectOsGitSummaryStatus::NotGit,
                "Folder is not a Git repository root.",
            );
        }
    };
    let top_level = top_level.trim();
    let Ok(top_level) = fs::canonicalize(top_level) else {
        return git_summary_status(ProjectOsGitSummaryStatus::Failed, "Git read failed.");
    };
    let Ok(root) = fs::canonicalize(root) else {
        return git_summary_status(ProjectOsGitSummaryStatus::Failed, "Git read failed.");
    };
    if top_level != root {
        return git_summary_status(
            ProjectOsGitSummaryStatus::NotRepoRoot,
            "Folder is not the Git repository root.",
        );
    }

    let head = match run_git(&git_args(&["rev-parse", "HEAD"])) {
        Ok(value) => value.trim().to_string(),
        Err(_) => return git_summary_status(ProjectOsGitSummaryStatus::Failed, "Git read failed."),
    };
    if !git_commit_is_safe(&head) {
        return git_summary_status(ProjectOsGitSummaryStatus::Failed, "Git read failed.");
    }

    let previous = previous_commit
        .filter(|value| git_commit_is_safe(value))
        .map(ToString::to_string);
    let range = previous
        .as_ref()
        .filter(|value| value.as_str() != head)
        .map(|value| format!("{value}..HEAD"));

    let status_short = match run_git(&status_args()) {
        Ok(value) => value,
        Err(_) => return git_summary_status(ProjectOsGitSummaryStatus::Failed, "Git read failed."),
    };
    let (status_short, mut changed_paths) = match parse_status_short(&status_short) {
        Ok(value) => value,
        Err(()) => {
            return git_summary_status(ProjectOsGitSummaryStatus::Failed, "Git read failed.");
        }
    };

    let diff_name_status_output = match run_git(&diff_args("--name-status", range.as_deref())) {
        Ok(value) => value,
        Err(_) => return git_summary_status(ProjectOsGitSummaryStatus::Failed, "Git read failed."),
    };
    let (diff_name_status, diff_paths) = match parse_name_status(&diff_name_status_output) {
        Ok(value) => value,
        Err(()) => {
            return git_summary_status(ProjectOsGitSummaryStatus::Failed, "Git read failed.");
        }
    };
    for path in diff_paths {
        push_unique(&mut changed_paths, path);
    }

    let diff_stat_output = match run_git(&diff_args("--stat", range.as_deref())) {
        Ok(value) => value,
        Err(_) => return git_summary_status(ProjectOsGitSummaryStatus::Failed, "Git read failed."),
    };
    let diff_stat = match parse_diff_stat(&diff_stat_output) {
        Ok(value) => value,
        Err(()) => {
            return git_summary_status(ProjectOsGitSummaryStatus::Failed, "Git read failed.");
        }
    };

    let log_oneline = if previous.as_deref() == Some(head.as_str()) {
        Vec::new()
    } else {
        let log_oneline_output = match run_git(&log_args(range.as_deref())) {
            Ok(value) => value,
            Err(_) => {
                return git_summary_status(ProjectOsGitSummaryStatus::Failed, "Git read failed.");
            }
        };
        match parse_log_oneline(&log_oneline_output) {
            Ok(value) => value,
            Err(()) => {
                return git_summary_status(ProjectOsGitSummaryStatus::Failed, "Git read failed.");
            }
        }
    };

    ProjectOsGitSummary {
        status: ProjectOsGitSummaryStatus::Ready,
        head: Some(head),
        previous_commit: previous,
        range,
        changed_paths,
        status_short,
        diff_name_status,
        diff_stat,
        log_oneline,
        message: None,
    }
}

fn git_summary_status(status: ProjectOsGitSummaryStatus, message: &str) -> ProjectOsGitSummary {
    ProjectOsGitSummary {
        status,
        head: None,
        previous_commit: None,
        range: None,
        changed_paths: Vec::new(),
        status_short: Vec::new(),
        diff_name_status: Vec::new(),
        diff_stat: Vec::new(),
        log_oneline: Vec::new(),
        message: Some(message.to_string()),
    }
}

fn run_git_command(root: &Path, args: &[String]) -> Result<String, String> {
    let mut command = Command::new("git");
    command
        .current_dir(root)
        .env_clear()
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_ATTR_NOSYSTEM", "1");
    if let Some(path) = std::env::var_os("PATH") {
        command.env("PATH", path);
    }
    #[cfg(windows)]
    for key in ["SystemRoot", "WINDIR"] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    let output = command
        .args(args)
        .output()
        .map_err(|_| "Git read failed.".to_string())?;
    if !output.status.success() {
        return Err("Git read failed.".to_string());
    }
    String::from_utf8(output.stdout).map_err(|_| "Git read failed.".to_string())
}

fn git_args(args: &[&str]) -> Vec<String> {
    let mut safe_args = vec!["--no-optional-locks".to_string()];
    for (key, value) in SAFE_GIT_CONFIG {
        safe_args.push("-c".to_string());
        safe_args.push(format!("{key}={value}"));
    }
    safe_args.extend(args.iter().map(|value| (*value).to_string()));
    safe_args
}

fn status_args() -> Vec<String> {
    let mut args = git_args(&["status", "--short", "--untracked-files=all"]);
    append_project_pathspec(&mut args);
    args
}

fn diff_args(kind: &str, range: Option<&str>) -> Vec<String> {
    let mut args = git_args(&["diff", "--no-ext-diff", "--no-textconv", kind]);
    match range {
        Some(value) => args.push(value.to_string()),
        None => args.push("HEAD".to_string()),
    }
    append_project_pathspec(&mut args);
    args
}

fn log_args(range: Option<&str>) -> Vec<String> {
    let mut args = git_args(&["log", "--oneline", "--max-count=20"]);
    args.push(range.unwrap_or("HEAD").to_string());
    append_project_pathspec(&mut args);
    args
}

fn append_project_pathspec(args: &mut Vec<String>) {
    args.push("--".to_string());
    args.push(PROJECT_PATHSPEC.to_string());
    for root in SECOND_BRAIN_ROOT_NAMES {
        args.push(format!(":(exclude){root}"));
        args.push(format!(":(exclude){root}/**"));
    }
}
