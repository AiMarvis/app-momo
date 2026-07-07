// @allow SIZE_OK - legacy Project OS manifest scanner owns folder traversal, snippet extraction, and safety helpers; this change only exposes existing path/secret helpers for Git receipt validation.
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, command};
use tauri_plugin_dialog::DialogExt;

const MAX_FILES: usize = 200;
const MAX_BYTES: u64 = 512 * 1024;
const MAX_SNIPPET_BYTES_U64: u64 = 4096;
pub(crate) const SECOND_BRAIN_ROOT_NAMES: &[&str] = &[
    ".AgentRuns",
    "Calendar",
    "Inbox",
    "Issues",
    "Knowledge",
    "Organize Inbox",
    "Planning",
    "Projects",
    "Tasks",
];

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOsManifest {
    pub root_name: String,
    pub files: Vec<ProjectOsFileSnippet>,
    pub skipped: Vec<ProjectOsSkippedPath>,
    pub limits: ProjectOsScanLimits,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOsFileSnippet {
    pub path: String,
    pub size: u64,
    pub snippet: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOsSkippedPath {
    pub path: String,
    pub reason: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOsScanLimits {
    pub max_files: usize,
    pub max_bytes: u64,
    pub bytes_read: u64,
    pub truncated: bool,
}

#[command]
pub async fn project_os_choose_folder(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<Option<String>, String>>();
    app.dialog().file().pick_folder(move |path| {
        let selected = match path.and_then(|value| value.into_path().ok()) {
            Some(value) => canonical_project_root(&value.to_string_lossy())
                .map(|root| Some(root.to_string_lossy().to_string())),
            None => Ok(None),
        };
        let _ = tx.send(selected);
    });
    tauri::async_runtime::spawn_blocking(move || rx.recv().map_err(|error| error.to_string())?)
        .await
        .map_err(|error| format!("Failed to open folder dialog: {error}"))?
}

#[command]
pub async fn project_os_scan_folder(path: String) -> Result<ProjectOsManifest, String> {
    tauri::async_runtime::spawn_blocking(move || scan_project_folder(&path))
        .await
        .map_err(|error| format!("Failed to scan project folder: {error}"))?
}

fn scan_project_folder(path: &str) -> Result<ProjectOsManifest, String> {
    let root = canonical_project_root(path)?;
    Ok(ProjectScan::new(root).run())
}

pub(crate) fn canonical_project_root(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("Invalid project root: empty path".to_string());
    }
    if path.contains('\0') {
        return Err("Invalid project root: null byte".to_string());
    }

    let raw = Path::new(path);
    if !raw.is_absolute() {
        return Err("Invalid project root: path must be absolute".to_string());
    }
    if raw
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("Invalid project root: traversal segment".to_string());
    }
    let root = fs::canonicalize(raw)
        .map_err(|error| format!("Project root must be an existing directory: {error}"))?;
    let metadata = fs::metadata(&root)
        .map_err(|error| format!("Project root must be an existing directory: {error}"))?;
    if !metadata.is_dir() {
        return Err("Project root must be an existing directory".to_string());
    }
    if root.parent().is_none() {
        return Err("Invalid project root: filesystem root is not allowed".to_string());
    }
    if root.components().any(|component| {
        let Component::Normal(segment) = component else {
            return false;
        };
        segment
            .to_str()
            .is_some_and(is_forbidden_linked_root_component)
    }) {
        return Err("Invalid project root: second-brain folders cannot be linked".to_string());
    }
    Ok(root)
}

struct ProjectScan {
    root: PathBuf,
    stack: Vec<PathBuf>,
    files: Vec<ProjectOsFileSnippet>,
    skipped: Vec<ProjectOsSkippedPath>,
    bytes_read: u64,
    truncated: bool,
}

impl ProjectScan {
    fn new(root: PathBuf) -> Self {
        Self {
            stack: vec![root.clone()],
            root,
            files: Vec::new(),
            skipped: Vec::new(),
            bytes_read: 0,
            truncated: false,
        }
    }

    fn run(mut self) -> ProjectOsManifest {
        while let Some(dir) = self.stack.pop() {
            self.scan_dir(&dir);
            if self.truncated {
                break;
            }
        }

        let root_name = self
            .root
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("project")
            .to_string();
        let limits = ProjectOsScanLimits {
            max_files: MAX_FILES,
            max_bytes: MAX_BYTES,
            bytes_read: self.bytes_read,
            truncated: self.truncated,
        };
        ProjectOsManifest {
            root_name,
            files: self.files,
            skipped: self.skipped,
            limits,
        }
    }

    fn scan_dir(&mut self, dir: &Path) {
        let entries = match fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(error) => {
                self.skip(dir, &format!("directory unreadable: {error}"));
                return;
            }
        };
        let mut paths = Vec::new();
        for entry in entries {
            match entry {
                Ok(value) => paths.push(value.path()),
                Err(error) => self.skip(dir, &format!("directory entry unreadable: {error}")),
            }
        }
        paths.sort();

        for path in paths {
            if self.files.len() >= MAX_FILES || self.bytes_read >= MAX_BYTES {
                self.truncated = true;
                return;
            }
            self.scan_entry(&path);
        }
    }

    fn scan_entry(&mut self, path: &Path) {
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if name.is_empty() {
            return;
        }

        let symlink_metadata = match fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(error) => {
                self.skip(path, &format!("metadata unreadable: {error}"));
                return;
            }
        };
        if symlink_metadata.file_type().is_symlink() {
            self.skip(path, self.symlink_reason(path));
            return;
        }

        let canonical = match fs::canonicalize(path) {
            Ok(value) => value,
            Err(error) => {
                self.skip(path, &format!("path unreadable: {error}"));
                return;
            }
        };
        if !canonical.starts_with(&self.root) {
            self.skip(path, "escaped project root");
            return;
        }

        let metadata = match fs::metadata(&canonical) {
            Ok(metadata) => metadata,
            Err(error) => {
                self.skip(path, &format!("metadata unreadable: {error}"));
                return;
            }
        };
        if metadata.is_dir() {
            if should_skip_dir(name) {
                self.skip(&canonical, "directory skipped");
            } else {
                self.stack.push(canonical);
            }
            return;
        }
        if !metadata.is_file() {
            self.skip(&canonical, "non-file skipped");
            return;
        }
        if should_skip_file(name, &canonical) {
            self.skip(&canonical, "file skipped");
            return;
        }
        self.read_file(&canonical, metadata.len());
    }

    fn read_file(&mut self, path: &Path, size: u64) {
        let remaining = MAX_BYTES.saturating_sub(self.bytes_read);
        let limit_u64 = remaining.min(MAX_SNIPPET_BYTES_U64).min(size);
        if limit_u64 == 0 {
            self.truncated = true;
            return;
        }
        let Ok(limit) = usize::try_from(limit_u64) else {
            self.truncated = true;
            return;
        };

        let mut buffer = vec![0_u8; limit];
        let read = match fs::File::open(path).and_then(|mut file| file.read(&mut buffer)) {
            Ok(read) => read,
            Err(error) => {
                self.skip(path, &format!("file unreadable: {error}"));
                return;
            }
        };
        buffer.truncate(read);
        let Ok(read_bytes) = u64::try_from(read) else {
            self.truncated = true;
            return;
        };
        self.bytes_read = self.bytes_read.saturating_add(read_bytes);

        if buffer.contains(&0) {
            self.skip(path, "binary skipped");
            return;
        }
        let snippet = match String::from_utf8(buffer) {
            Ok(value) => value,
            Err(_) => {
                self.skip(path, "non-utf8 skipped");
                return;
            }
        };
        let Some(relative) = self.relative(path) else {
            self.skip(path, "relative path unavailable");
            return;
        };
        self.files.push(ProjectOsFileSnippet {
            path: relative,
            size,
            snippet,
        });
    }

    fn skip(&mut self, path: &Path, reason: &str) {
        if let Some(relative) = self.relative(path) {
            self.skipped.push(ProjectOsSkippedPath {
                path: relative,
                reason: reason.to_string(),
            });
        }
    }

    fn symlink_reason(&self, path: &Path) -> &'static str {
        match fs::canonicalize(path) {
            Ok(target) if !target.starts_with(&self.root) => "symlink escape skipped",
            _ => "symlink skipped",
        }
    }

    fn relative(&self, path: &Path) -> Option<String> {
        let relative = path.strip_prefix(&self.root).ok()?;
        let mut segments = Vec::new();
        for component in relative.components() {
            let Component::Normal(segment) = component else {
                return None;
            };
            segments.push(segment.to_string_lossy().to_string());
        }
        Some(segments.join("/"))
    }
}

fn should_skip_dir(name: &str) -> bool {
    if name.starts_with('.') || is_second_brain_root_name(name) {
        return true;
    }
    let lower = name.to_ascii_lowercase();
    [
        "node_modules",
        "target",
        "dist",
        "build",
        "vendor",
        "coverage",
        "__pycache__",
        "release-artifacts",
        "second-brain",
        "second_brain",
        "second brain",
    ]
    .contains(&lower.as_str())
}

pub(crate) fn is_second_brain_root_name(name: &str) -> bool {
    SECOND_BRAIN_ROOT_NAMES.contains(&name)
}

fn is_forbidden_linked_root_component(name: &str) -> bool {
    is_second_brain_root_name(name)
}

fn should_skip_file(name: &str, path: &Path) -> bool {
    let lower = name.to_ascii_lowercase();
    if name.starts_with('.') || lower == "organize_inbox_runtime.ts" || looks_secret(&lower) {
        return true;
    }
    if safe_file_name(&lower) {
        return false;
    }
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return true;
    };
    !safe_extension(&extension.to_ascii_lowercase())
}

pub(crate) fn looks_secret(lower_name: &str) -> bool {
    lower_name == ".env"
        || lower_name.starts_with(".env.")
        || lower_name.contains("secret")
        || lower_name.contains("token")
        || lower_name.contains("credential")
        || lower_name.contains("private")
        || ["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "credentials"].contains(&lower_name)
        || lower_name.ends_with(".pem")
        || lower_name.ends_with(".key")
        || lower_name.ends_with(".p12")
        || lower_name.ends_with(".pfx")
}

fn safe_file_name(lower_name: &str) -> bool {
    [
        "readme",
        "license",
        "dockerfile",
        "makefile",
        "gemfile",
        "rakefile",
    ]
    .contains(&lower_name)
}

fn safe_extension(extension: &str) -> bool {
    [
        "md", "mdx", "txt", "rst", "toml", "json", "jsonc", "yaml", "yml", "rs", "ts", "tsx", "js",
        "jsx", "mts", "cts", "py", "go", "java", "kt", "swift", "c", "h", "cpp", "hpp", "cs", "rb",
        "php", "sh", "sql", "css", "scss", "html", "xml",
    ]
    .contains(&extension)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    struct TempProjectRoot {
        path: PathBuf,
    }

    impl TempProjectRoot {
        fn new(label: &str) -> Self {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("momo-project-os-{label}-{stamp}"));
            fs::create_dir_all(&path).expect("temp root should be created");
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }

        fn join(&self, path: &str) -> PathBuf {
            self.path.join(path)
        }
    }

    impl Drop for TempProjectRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn scan(root: &Path) -> ProjectOsManifest {
        let path = root.to_str().expect("temp path should be valid UTF-8");
        scan_project_folder(path).expect("scan should succeed")
    }

    #[test]
    fn scan_project_folder_rejects_malformed_root_when_path_unsafe() {
        for input in [
            "",
            "relative/project",
            "../project",
            "/tmp/../project",
            "bad\0path",
        ] {
            assert!(
                scan_project_folder(input).is_err(),
                "expected unsafe root to fail: {input:?}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn scan_project_folder_rejects_filesystem_root() {
        assert!(
            scan_project_folder("/").is_err(),
            "filesystem root should not be a Project OS root"
        );
    }

    #[test]
    fn scan_project_folder_rejects_second_brain_roots() {
        for name in SECOND_BRAIN_ROOT_NAMES {
            let parent = TempProjectRoot::new("second-brain-root");
            let root = parent.join(name);
            fs::create_dir_all(&root).expect("second-brain root should be created");
            fs::write(root.join("private.md"), "do not scan second brain")
                .expect("second-brain file should be written");

            assert!(
                scan_project_folder(root.to_str().expect("path should be UTF-8")).is_err(),
                "second-brain root should not be linkable: {root:?}"
            );
        }
    }

    #[test]
    fn scan_project_folder_rejects_roots_nested_under_second_brain_roots() {
        for name in SECOND_BRAIN_ROOT_NAMES {
            let parent = TempProjectRoot::new("second-brain-nested-root");
            let root = parent.join(name).join("linked-project");
            fs::create_dir_all(&root).expect("nested second-brain root should be created");
            fs::write(root.join("private.md"), "do not scan second brain")
                .expect("second-brain file should be written");

            assert!(
                scan_project_folder(root.to_str().expect("path should be UTF-8")).is_err(),
                "nested second-brain root should not be linkable: {root:?}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn scan_project_folder_rejects_root_symlink_to_second_brain_root() {
        use std::os::unix::fs::symlink;

        let parent = TempProjectRoot::new("root-symlink-parent");
        let target_parent = TempProjectRoot::new("root-symlink-target");
        let knowledge = target_parent.join("Knowledge");
        fs::create_dir_all(&knowledge).expect("Knowledge target should be created");
        fs::write(knowledge.join("private.md"), "do not scan through symlink")
            .expect("Knowledge file should be written");
        let link = parent.join("linked-project");
        symlink(&knowledge, &link).expect("root symlink should be created");

        assert!(
            scan_project_folder(link.to_str().expect("path should be UTF-8")).is_err(),
            "root symlink to second-brain folder should not be linkable"
        );
    }

    #[cfg(unix)]
    #[test]
    fn scan_project_folder_marks_symlink_escape_when_link_points_outside_root() {
        use std::os::unix::fs::symlink;

        let root = TempProjectRoot::new("symlink");
        let outside_root = TempProjectRoot::new("outside");
        let outside = outside_root.join("secret.md");
        fs::write(&outside, "do not read").expect("outside file should be written");
        symlink(&outside, root.join("leak.md")).expect("symlink should be created");

        let manifest = scan(root.path());

        assert!(
            manifest
                .skipped
                .iter()
                .any(|item| item.path == "leak.md" && item.reason.contains("symlink")),
            "symlink escape should be marked, got {manifest:?}"
        );
    }

    #[test]
    fn scan_project_folder_returns_manifest_with_relative_paths_only() {
        let root = TempProjectRoot::new("manifest");
        fs::create_dir_all(root.join("src")).expect("src dir should be created");
        fs::write(
            root.join("src").join("main.ts"),
            "export const ok = true;\n",
        )
        .expect("source file should be written");

        let manifest = scan(root.path());
        let root_text = root.path().to_string_lossy();

        assert!(
            manifest
                .files
                .iter()
                .any(|file| file.path == "src/main.ts" && file.snippet.contains("export const ok")),
            "safe source snippet should be included, got {manifest:?}"
        );
        assert!(
            manifest.files.iter().all(|file| {
                !Path::new(&file.path).is_absolute()
                    && !file.path.contains("..")
                    && !file.path.contains(root_text.as_ref())
            }),
            "manifest paths must stay relative, got {manifest:?}"
        );
    }
}
