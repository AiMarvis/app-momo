use std::fs;
use std::path::Path;

use super::test_support::{
    TempProjectRoot, git_command_output, git_output, git_status_output,
    git_summary_with_date_outputs, git_summary_with_outputs,
};
use super::{
    ProjectOsGitSummaryStatus, commit_numstat_args, date_log_args, diff_args, git_args, log_args,
    project_git_summary_for_root,
};

#[test]
fn git_summary_is_non_fatal_when_folder_is_not_git() {
    let root = TempProjectRoot::plain("nonfatal");

    let summary = project_git_summary_for_root(root.path(), None, None, None, |_| {
        Err("not a git repo".to_string())
    });

    assert_eq!(summary.status, ProjectOsGitSummaryStatus::NotGit);
    assert_eq!(summary.head, None);
    assert!(summary.changed_paths.is_empty());
}

#[test]
fn git_summary_reads_head_and_relative_changed_paths_when_folder_is_git_root() {
    let root = TempProjectRoot::git("root");
    fs::create_dir_all(root.join("src")).expect("src dir should be created");
    let head = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let root_text = root.text();

    let summary = git_summary_with_outputs(
        root.path(),
        None,
        vec![
            git_output(&["rev-parse", "--show-toplevel"], &root_text),
            git_output(&["rev-parse", "HEAD"], head),
            git_status_output(" M src/main.rs\n?? docs/plan.md\n"),
            git_command_output(
                diff_args("--name-status", None),
                "M\tsrc/main.rs\nA\tdocs/plan.md\n",
            ),
            git_command_output(
                diff_args("--stat", None),
                "src/main.rs | 2 +-\ndocs/plan.md | 1 +\n 2 files changed, 2 insertions(+), 1 deletion(-)\n",
            ),
            git_command_output(log_args(None), "aaaaaaaa initial\n"),
        ],
    );

    assert_eq!(summary.status, ProjectOsGitSummaryStatus::Ready);
    assert_eq!(summary.head.as_deref(), Some(head));
    assert_eq!(
        summary.changed_paths,
        vec!["src/main.rs".to_string(), "docs/plan.md".to_string()]
    );
    assert!(summary.changed_paths.iter().all(|path| {
        !Path::new(path).is_absolute() && !path.contains("..") && !path.contains(root_text.as_str())
    }));
}

#[test]
fn git_summary_accepts_safe_rename_diff_stat_lines() {
    let root = TempProjectRoot::git("rename-stat");
    let head = "cccccccccccccccccccccccccccccccccccccccc";
    let root_text = root.text();

    let summary = git_summary_with_outputs(
        root.path(),
        None,
        vec![
            git_output(&["rev-parse", "--show-toplevel"], &root_text),
            git_output(&["rev-parse", "HEAD"], head),
            git_status_output(" R src/old.rs -> src/new.rs\n"),
            git_command_output(
                diff_args("--name-status", None),
                "R100\tsrc/old.rs\tsrc/new.rs\n",
            ),
            git_command_output(
                diff_args("--stat", None),
                "src/{old.rs => new.rs} | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n",
            ),
            git_command_output(log_args(None), "ccccccc rename file\n"),
        ],
    );

    assert_eq!(summary.status, ProjectOsGitSummaryStatus::Ready);
    assert!(
        summary
            .diff_stat
            .iter()
            .any(|line| line.contains("{old.rs => new.rs}"))
    );
}

#[test]
fn git_summary_omits_commit_log_when_previous_commit_is_current_head() {
    let root = TempProjectRoot::git("same-head");
    let head = "dddddddddddddddddddddddddddddddddddddddd";
    let root_text = root.text();

    let summary = git_summary_with_outputs(
        root.path(),
        Some(head),
        vec![
            git_output(&["rev-parse", "--show-toplevel"], &root_text),
            git_output(&["rev-parse", "HEAD"], head),
            git_status_output(""),
            git_command_output(diff_args("--name-status", None), ""),
            git_command_output(diff_args("--stat", None), ""),
        ],
    );

    assert_eq!(summary.status, ProjectOsGitSummaryStatus::Ready);
    assert_eq!(summary.previous_commit.as_deref(), Some(head));
    assert!(summary.range.is_none());
    assert!(summary.log_oneline.is_empty());
}

#[test]
fn git_summary_does_not_treat_repo_subdirectory_as_git_root() {
    let root = TempProjectRoot::git("parent");
    let subdir = root.join("packages/app");
    fs::create_dir_all(&subdir).expect("subdir should be created");
    let root_text = root.text();

    let summary = project_git_summary_for_root(&subdir, None, None, None, |args| {
        if args == git_args(&["rev-parse", "--show-toplevel"]) {
            Ok(root_text.clone())
        } else {
            Err(format!("git should stop before detailed reads: {args:?}"))
        }
    });

    assert_eq!(summary.status, ProjectOsGitSummaryStatus::NotRepoRoot);
    assert_eq!(summary.head, None);
}

#[test]
fn git_summary_reads_schedule_date_range_commit_metadata_by_day() {
    let root = TempProjectRoot::git("date-range");
    let head = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    let root_text = root.text();
    let full_hash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let short_hash = "aaaaaaa";
    let date_range = super::ProjectGitDateRange {
        start: chrono::NaiveDate::from_ymd_opt(2026, 7, 1).expect("valid start"),
        end: chrono::NaiveDate::from_ymd_opt(2026, 7, 3).expect("valid end"),
    };

    let summary = git_summary_with_date_outputs(
        root.path(),
        None,
        Some("2026-07-01"),
        Some("2026-07-03"),
        vec![
            git_output(&["rev-parse", "--show-toplevel"], &root_text),
            git_output(&["rev-parse", "HEAD"], head),
            git_status_output("M  docs/release.md\n M src/app.rs\n?? docs/todo.md\n"),
            git_command_output(
                diff_args("--name-status", None),
                "M\tdocs/release.md\nM\tsrc/app.rs\nA\tdocs/todo.md\n",
            ),
            git_command_output(
                diff_args("--stat", None),
                "docs/release.md | 5 +++--\nsrc/app.rs | 2 +-\n 2 files changed, 4 insertions(+), 3 deletions(-)\n",
            ),
            git_command_output(log_args(None), "eeeeeee latest work\n"),
            git_command_output(
                date_log_args(&date_range),
                &format!(
                    "{full_hash}\x1f{short_hash}\x1fMomo\x1f2026-07-02T10:30:00+09:00\x1f사용자 릴리즈 점검\n"
                ),
            ),
            git_command_output(
                commit_numstat_args(full_hash),
                "4\t1\tdocs/release.md\n2\t0\tsrc/app.rs\n",
            ),
        ],
    );

    assert_eq!(summary.status, ProjectOsGitSummaryStatus::Ready);
    assert_eq!(summary.range.as_deref(), Some("2026-07-01..2026-07-03"));
    assert_eq!(summary.commits_by_date.len(), 3);
    assert!(summary.commits_by_date[0].commits.is_empty());
    assert!(summary.commits_by_date[2].commits.is_empty());
    let commit = &summary.commits_by_date[1].commits[0];
    assert_eq!(commit.short_hash, short_hash);
    assert_eq!(commit.subject, "사용자 릴리즈 점검");
    assert_eq!(commit.author, "Momo");
    assert_eq!(commit.author_date, "2026-07-02T10:30:00+09:00");
    assert_eq!(
        commit.changed_paths,
        vec!["docs/release.md".to_string(), "src/app.rs".to_string()]
    );
    assert_eq!(commit.diff_stat[0].additions, 4);
    assert_eq!(commit.diff_stat[0].deletions, 1);
    assert_eq!(summary.working_tree.staged_paths, vec!["docs/release.md"]);
    assert_eq!(summary.working_tree.unstaged_paths, vec!["src/app.rs"]);
    assert_eq!(summary.working_tree.untracked_paths, vec!["docs/todo.md"]);
}

#[test]
fn git_summary_rejects_unsafe_schedule_commit_paths() {
    let root = TempProjectRoot::git("unsafe-commit-path");
    let head = "ffffffffffffffffffffffffffffffffffffffff";
    let root_text = root.text();
    let full_hash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let date_range = super::ProjectGitDateRange {
        start: chrono::NaiveDate::from_ymd_opt(2026, 7, 1).expect("valid start"),
        end: chrono::NaiveDate::from_ymd_opt(2026, 7, 1).expect("valid end"),
    };

    let summary = git_summary_with_date_outputs(
        root.path(),
        None,
        Some("2026-07-01"),
        Some("2026-07-01"),
        vec![
            git_output(&["rev-parse", "--show-toplevel"], &root_text),
            git_output(&["rev-parse", "HEAD"], head),
            git_status_output(""),
            git_command_output(diff_args("--name-status", None), ""),
            git_command_output(diff_args("--stat", None), ""),
            git_command_output(log_args(None), "fffffff latest work\n"),
            git_command_output(
                date_log_args(&date_range),
                &format!(
                    "{full_hash}\x1fbbbbbbb\x1fMomo\x1f2026-07-01T10:30:00+09:00\x1funsafe path\n"
                ),
            ),
            git_command_output(commit_numstat_args(full_hash), "1\t0\tKnowledge/raw.md\n"),
        ],
    );

    assert_eq!(summary.status, ProjectOsGitSummaryStatus::Failed);
    assert!(summary.commits_by_date.is_empty());
}
