use std::fs;
use std::path::Path;
use std::process::Command;

use chrono::{Duration, NaiveDate};
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
    git_commit_is_safe, git_diff_stat_path_is_safe, parse_diff_stat, parse_log_oneline,
    parse_name_status, parse_status_short, parse_status_short_paths, push_unique,
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
    pub commits_by_date: Vec<ProjectOsGitDateSummary>,
    pub working_tree: ProjectOsGitWorkingTreeSummary,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOsGitDateSummary {
    pub date: String,
    pub commits: Vec<ProjectOsGitCommitSummary>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOsGitCommitSummary {
    pub short_hash: String,
    pub subject: String,
    pub author: String,
    pub author_date: String,
    pub changed_paths: Vec<String>,
    pub diff_stat: Vec<ProjectOsGitFileStat>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOsGitFileStat {
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOsGitWorkingTreeSummary {
    pub staged_paths: Vec<String>,
    pub unstaged_paths: Vec<String>,
    pub untracked_paths: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ProjectGitDateRange {
    start: NaiveDate,
    end: NaiveDate,
}

#[command]
pub async fn project_os_git_summary(
    path: String,
    previous_commit: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<ProjectOsGitSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_project_git_summary(
            &path,
            previous_commit.as_deref(),
            start_date.as_deref(),
            end_date.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("Failed to read project Git summary: {error}"))?
}

fn read_project_git_summary(
    path: &str,
    previous_commit: Option<&str>,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Result<ProjectOsGitSummary, String> {
    let root = canonical_project_root(path)?;
    Ok(project_git_summary_for_root(
        &root,
        previous_commit,
        start_date,
        end_date,
        |args| run_git_command(&root, args),
    ))
}

fn project_git_summary_for_root<F>(
    root: &Path,
    previous_commit: Option<&str>,
    start_date: Option<&str>,
    end_date: Option<&str>,
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
    let date_range = project_git_date_range(start_date, end_date);
    let evidence_range = date_range
        .as_ref()
        .map(|range| format!("{}..{}", range.start, range.end))
        .or_else(|| range.clone());

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
    let working_tree = match working_tree_from_status_short(&status_short) {
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
    let commits_by_date = match commits_by_date(date_range.as_ref(), &mut run_git) {
        Ok(value) => value,
        Err(()) => {
            return git_summary_status(ProjectOsGitSummaryStatus::Failed, "Git read failed.");
        }
    };

    ProjectOsGitSummary {
        status: ProjectOsGitSummaryStatus::Ready,
        head: Some(head),
        previous_commit: previous,
        range: evidence_range,
        changed_paths,
        status_short,
        diff_name_status,
        diff_stat,
        log_oneline,
        commits_by_date,
        working_tree,
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
        commits_by_date: Vec::new(),
        working_tree: ProjectOsGitWorkingTreeSummary {
            staged_paths: Vec::new(),
            unstaged_paths: Vec::new(),
            untracked_paths: Vec::new(),
        },
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

fn date_log_args(range: &ProjectGitDateRange) -> Vec<String> {
    let since = format!("--since={} 00:00:00", range.start);
    let until = format!("--until={} 23:59:59", range.end);
    let mut args = git_args(&[
        "log",
        "--date=iso-strict",
        "--pretty=format:%H%x1f%h%x1f%an%x1f%aI%x1f%s",
    ]);
    args.push(since);
    args.push(until);
    append_project_pathspec(&mut args);
    args
}

fn commit_numstat_args(hash: &str) -> Vec<String> {
    let mut args = git_args(&[
        "show",
        "--no-ext-diff",
        "--no-textconv",
        "--format=",
        "--numstat",
    ]);
    args.push(hash.to_string());
    append_project_pathspec(&mut args);
    args
}

fn project_git_date_range(
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Option<ProjectGitDateRange> {
    let start = NaiveDate::parse_from_str(start_date?, "%Y-%m-%d").ok()?;
    let end = NaiveDate::parse_from_str(end_date?, "%Y-%m-%d").ok()?;
    (start <= end).then_some(ProjectGitDateRange { start, end })
}

fn commits_by_date<F>(
    range: Option<&ProjectGitDateRange>,
    run_git: &mut F,
) -> Result<Vec<ProjectOsGitDateSummary>, ()>
where
    F: FnMut(&[String]) -> Result<String, String>,
{
    let Some(range) = range else {
        return Ok(Vec::new());
    };
    let mut summaries = empty_date_summaries(range);
    let output = run_git(&date_log_args(range)).map_err(|_| ())?;
    for line in output.lines().filter(|line| !line.trim().is_empty()) {
        let commit = parse_commit_log_line(line, run_git)?;
        let date = commit.author_date.get(0..10).ok_or(())?;
        let Some(summary) = summaries.iter_mut().find(|summary| summary.date == date) else {
            continue;
        };
        summary.commits.push(commit);
    }
    Ok(summaries)
}

fn empty_date_summaries(range: &ProjectGitDateRange) -> Vec<ProjectOsGitDateSummary> {
    let mut summaries = Vec::new();
    let mut date = range.start;
    while date <= range.end {
        summaries.push(ProjectOsGitDateSummary {
            date: date.to_string(),
            commits: Vec::new(),
        });
        date += Duration::days(1);
    }
    summaries
}

fn parse_commit_log_line<F>(line: &str, run_git: &mut F) -> Result<ProjectOsGitCommitSummary, ()>
where
    F: FnMut(&[String]) -> Result<String, String>,
{
    let parts = line.splitn(5, '\x1f').collect::<Vec<_>>();
    if parts.len() != 5 || parts.iter().any(|part| part.contains('\0')) {
        return Err(());
    }
    let hash = parts[0];
    let short_hash = parts[1];
    let author = parts[2];
    let author_date = parts[3];
    let subject = parts[4];
    if !git_commit_is_safe(hash)
        || !git_commit_is_safe(short_hash)
        || author.trim().is_empty()
        || author_date.trim().is_empty()
        || subject.trim().is_empty()
    {
        return Err(());
    }
    let output = run_git(&commit_numstat_args(hash)).map_err(|_| ())?;
    let (diff_stat, changed_paths) = parse_numstat(&output)?;
    Ok(ProjectOsGitCommitSummary {
        short_hash: short_hash.to_string(),
        subject: subject.to_string(),
        author: author.to_string(),
        author_date: author_date.to_string(),
        changed_paths,
        diff_stat,
    })
}

fn parse_numstat(output: &str) -> Result<(Vec<ProjectOsGitFileStat>, Vec<String>), ()> {
    let mut diff_stat = Vec::new();
    let mut changed_paths = Vec::new();
    for line in output.lines().filter(|line| !line.trim().is_empty()) {
        let mut parts = line.split('\t');
        let additions = parse_numstat_count(parts.next().ok_or(())?)?;
        let deletions = parse_numstat_count(parts.next().ok_or(())?)?;
        let path = parts.next().ok_or(())?;
        if parts.next().is_some() {
            return Err(());
        }
        if git_diff_stat_path_is_safe(path).is_err() {
            continue;
        }
        push_unique(&mut changed_paths, path.to_string());
        diff_stat.push(ProjectOsGitFileStat {
            path: path.to_string(),
            additions,
            deletions,
        });
    }
    Ok((diff_stat, changed_paths))
}

fn parse_numstat_count(value: &str) -> Result<u32, ()> {
    if value == "-" {
        return Ok(0);
    }
    value.parse::<u32>().map_err(|_| ())
}

fn working_tree_from_status_short(
    status_short: &[String],
) -> Result<ProjectOsGitWorkingTreeSummary, ()> {
    let mut staged_paths = Vec::new();
    let mut unstaged_paths = Vec::new();
    let mut untracked_paths = Vec::new();
    for line in status_short {
        if line.len() < 4 {
            return Err(());
        }
        let mut chars = line.chars();
        let index = chars.next().ok_or(())?;
        let worktree = chars.next().ok_or(())?;
        let paths = parse_status_short_paths(line[3..].trim())?;
        if index == '?' && worktree == '?' {
            for path in paths {
                push_unique(&mut untracked_paths, path);
            }
            continue;
        }
        if index != ' ' {
            for path in &paths {
                push_unique(&mut staged_paths, path.clone());
            }
        }
        if worktree != ' ' {
            for path in paths {
                push_unique(&mut unstaged_paths, path);
            }
        }
    }
    Ok(ProjectOsGitWorkingTreeSummary {
        staged_paths,
        unstaged_paths,
        untracked_paths,
    })
}

fn append_project_pathspec(args: &mut Vec<String>) {
    args.push("--".to_string());
    args.push(PROJECT_PATHSPEC.to_string());
    for root in SECOND_BRAIN_ROOT_NAMES {
        args.push(format!(":(exclude){root}"));
        args.push(format!(":(exclude){root}/**"));
    }
}
