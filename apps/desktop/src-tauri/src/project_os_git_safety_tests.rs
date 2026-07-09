use std::fs;
use std::path::Path;

use super::parse::{git_diff_stat_path_is_safe, git_relative_path_is_safe};
use super::test_support::{
    TempProjectRoot, git_output, git_status_output, git_summary_with_outputs,
};
use super::{
    ProjectGitDateRange, ProjectOsGitSummaryStatus, commit_numstat_args, date_log_args, diff_args,
    git_args, log_args, status_args,
};
use crate::project_os::SECOND_BRAIN_ROOT_NAMES;

#[test]
fn git_summary_rejects_unsafe_or_second_brain_paths_from_git_output() {
    let root = TempProjectRoot::git("unsafe-output");
    let head = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let root_text = root.text();

    let summary = git_summary_with_outputs(
        root.path(),
        None,
        vec![
            git_output(&["rev-parse", "--show-toplevel"], &root_text),
            git_output(&["rev-parse", "HEAD"], head),
            git_status_output("?? Inbox/private.md\n"),
        ],
    );

    assert_eq!(summary.status, ProjectOsGitSummaryStatus::Failed);
    assert!(summary.changed_paths.is_empty());
    assert!(
        !summary
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("Inbox"),
        "safe failure must not leak rejected Git paths: {summary:?}"
    );

    for path in [
        "/tmp/escape.rs",
        "../escape.rs",
        "src\\main.rs",
        "old.rs -> new.rs",
        "Knowledge/private.md",
        "Tasks/private.md",
        ".env",
        "config/app.pem",
        "docs/private-plan.md",
        "src/api_token.ts",
        "bad\0path.rs",
    ] {
        assert!(
            git_relative_path_is_safe(path).is_err(),
            "unsafe Git path should be rejected: {path:?}"
        );
    }

    assert!(git_diff_stat_path_is_safe("src/{old.rs => new.rs}").is_ok());
    assert!(git_diff_stat_path_is_safe("Tasks/{old.md => new.md}").is_err());
}

#[test]
fn git_summary_command_is_registered_and_uses_read_only_git_argv() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let lib_source = fs::read_to_string(manifest_dir.join("src").join("lib.rs"))
        .expect("lib source should be readable");

    assert!(
        lib_source.contains("project_os_git::project_os_git_summary"),
        "Tauri handler must register project_os_git_summary"
    );

    let argv_sets = [
        git_args(&["rev-parse", "--show-toplevel"]),
        git_args(&["rev-parse", "HEAD"]),
        status_args(),
        diff_args("--name-status", None),
        diff_args("--stat", Some("1234567..HEAD")),
        log_args(Some("1234567..HEAD")),
        date_log_args(&test_date_range()),
        commit_numstat_args("1234567890abcdef1234567890abcdef12345678"),
    ];
    for args in argv_sets {
        assert_git_args_are_read_only(&args);
        assert_git_args_disable_helper_config(&args);
    }

    assert!(
        diff_args("--name-status", None)
            .iter()
            .any(|arg| arg == "--no-ext-diff")
    );
    assert!(
        diff_args("--name-status", None)
            .iter()
            .any(|arg| arg == "--no-textconv")
    );

    assert!(
        fs::read_to_string(manifest_dir.join("src").join("project_os_git.rs"))
            .expect("project_os_git source should be readable")
            .contains(".env_clear()"),
        "Git command must not inherit GIT_* helper environment"
    );
}

#[test]
fn git_summary_commands_exclude_second_brain_paths_before_git_reads() {
    for args in [
        status_args(),
        diff_args("--name-status", None),
        diff_args("--stat", Some("1234567..HEAD")),
        log_args(Some("1234567..HEAD")),
        date_log_args(&test_date_range()),
        commit_numstat_args("1234567890abcdef1234567890abcdef12345678"),
    ] {
        assert_git_args_exclude_second_brain_paths(&args);
    }
}

fn test_date_range() -> ProjectGitDateRange {
    ProjectGitDateRange {
        start: chrono::NaiveDate::from_ymd_opt(2026, 7, 1).expect("valid start"),
        end: chrono::NaiveDate::from_ymd_opt(2026, 7, 3).expect("valid end"),
    }
}

fn assert_git_args_are_read_only(args: &[String]) {
    let forbidden_commands = [
        "commit", "checkout", "reset", "clean", "add", "rm", "mv", "branch", "tag",
    ];
    for command in forbidden_commands {
        assert!(
            !args.iter().any(|arg| arg == command),
            "Project OS Git argv must not include write command {command}: {args:?}"
        );
    }
}

fn assert_git_args_disable_helper_config(args: &[String]) {
    for (key, value) in [
        ("core.fsmonitor", "false"),
        ("core.quotepath", "false"),
        ("diff.external", ""),
    ] {
        assert!(
            args.windows(2)
                .any(|window| window[0] == "-c" && window[1] == format!("{key}={value}")),
            "Project OS Git argv must override helper config {key}: {args:?}"
        );
    }
}

fn assert_git_args_exclude_second_brain_paths(args: &[String]) {
    assert!(
        args.iter().any(|arg| arg == "--"),
        "Project OS Git argv must include a pathspec separator before exclusions: {args:?}"
    );
    for root in SECOND_BRAIN_ROOT_NAMES {
        let root_pathspec = format!(":(exclude){root}");
        let child_pathspec = format!(":(exclude){root}/**");
        assert!(
            args.iter().any(|arg| arg == &root_pathspec),
            "Project OS Git argv must exclude second-brain pathspec {root_pathspec}: {args:?}"
        );
        assert!(
            args.iter().any(|arg| arg == &child_pathspec),
            "Project OS Git argv must exclude second-brain pathspec {child_pathspec}: {args:?}"
        );
    }
}
