use std::fs;
use std::path::Path;

use super::test_support::{
    TempProjectRoot, git_command_output, git_output, git_status_output, git_summary_with_outputs,
};
use super::{
    ProjectOsGitSummaryStatus, diff_args, git_args, log_args, project_git_summary_for_root,
};

#[test]
fn git_summary_is_non_fatal_when_folder_is_not_git() {
    let root = TempProjectRoot::plain("nonfatal");

    let summary =
        project_git_summary_for_root(root.path(), None, |_| Err("not a git repo".to_string()));

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

    let summary = project_git_summary_for_root(&subdir, None, |args| {
        if args == git_args(&["rev-parse", "--show-toplevel"]) {
            Ok(root_text.clone())
        } else {
            Err(format!("git should stop before detailed reads: {args:?}"))
        }
    });

    assert_eq!(summary.status, ProjectOsGitSummaryStatus::NotRepoRoot);
    assert_eq!(summary.head, None);
}
