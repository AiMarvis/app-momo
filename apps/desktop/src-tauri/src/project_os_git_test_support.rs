use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use super::{ProjectOsGitSummary, git_args, project_git_summary_for_root, status_args};

pub(super) struct TempProjectRoot {
    path: PathBuf,
}

impl TempProjectRoot {
    pub(super) fn plain(label: &str) -> Self {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("momo-project-os-git-{label}-{stamp}"));
        fs::create_dir_all(&path).expect("temp root should be created");
        Self { path }
    }

    pub(super) fn git(label: &str) -> Self {
        let root = Self::plain(label);
        fs::create_dir_all(root.path.join(".git")).expect("git dir should be created");
        root
    }

    pub(super) fn path(&self) -> &Path {
        &self.path
    }

    pub(super) fn join(&self, path: &str) -> PathBuf {
        self.path.join(path)
    }

    pub(super) fn text(&self) -> String {
        self.path
            .to_str()
            .expect("root path should be UTF-8")
            .to_string()
    }
}

impl Drop for TempProjectRoot {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

pub(super) fn git_summary_with_outputs(
    root: &Path,
    previous_commit: Option<&str>,
    outputs: Vec<(Vec<String>, String)>,
) -> ProjectOsGitSummary {
    project_git_summary_for_root(root, previous_commit, |args| {
        Ok(outputs
            .iter()
            .find_map(|(expected, output)| {
                let matches = expected
                    .iter()
                    .map(String::as_str)
                    .eq(args.iter().map(String::as_str));
                matches.then(|| output.clone())
            })
            .unwrap_or_else(|| {
                panic!(
                    "unexpected git args: {args:?}; expected one of: {:?}",
                    outputs
                        .iter()
                        .map(|(expected, _)| expected)
                        .collect::<Vec<_>>()
                )
            }))
    })
}

pub(super) fn git_output(args: &[&str], output: &str) -> (Vec<String>, String) {
    (git_args(args), output.to_string())
}

pub(super) fn git_command_output(args: Vec<String>, output: &str) -> (Vec<String>, String) {
    (args, output.to_string())
}

pub(super) fn git_status_output(output: &str) -> (Vec<String>, String) {
    (status_args(), output.to_string())
}
