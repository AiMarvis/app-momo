use std::future::Future;
use std::path::Path;
use std::pin::Pin;

use kuku_ai::ConflictItem;

pub fn compute_checksum(content: &str) -> String {
    blake3::hash(content.as_bytes()).to_hex().to_string()
}

pub async fn compute_directory_checksum(path: &Path) -> Result<String, String> {
    let mut entries = collect_directory_entries(path, path).await?;
    entries.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    let mut hasher = blake3::Hasher::new();
    for entry in entries {
        hasher.update(entry.kind.as_bytes());
        hasher.update(b"\0");
        hasher.update(entry.relative_path.as_bytes());
        hasher.update(b"\0");
        if let Some(checksum) = entry.checksum {
            hasher.update(checksum.as_bytes());
        }
        hasher.update(b"\n");
    }

    Ok(hasher.finalize().to_hex().to_string())
}

pub async fn guarded_create(path: &Path, content: &str) -> Result<(), ConflictItem> {
    if tokio::fs::try_exists(path)
        .await
        .map_err(|e| conflict(path, format!("Existence check failed: {e}")))?
    {
        return Err(conflict(path, "File already exists"));
    }

    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| conflict(path, format!("Failed to create parent directories: {e}")))?;
    }

    tokio::fs::write(path, content)
        .await
        .map_err(|e| conflict(path, format!("Failed to write file: {e}")))?;
    Ok(())
}

pub async fn guarded_create_dir(path: &Path) -> Result<(), ConflictItem> {
    if tokio::fs::try_exists(path)
        .await
        .map_err(|e| conflict(path, format!("Existence check failed: {e}")))?
    {
        return Err(conflict(path, "Directory already exists"));
    }

    tokio::fs::create_dir_all(path)
        .await
        .map_err(|e| conflict(path, format!("Failed to create directory: {e}")))?;
    Ok(())
}

pub async fn guarded_write(
    path: &Path,
    content: &str,
    expected_checksum: &str,
) -> Result<(), ConflictItem> {
    let current = tokio::fs::read_to_string(path)
        .await
        .map_err(|e| conflict(path, format!("Failed to read file: {e}")))?;
    let actual = compute_checksum(&current);
    if actual != expected_checksum {
        return Err(checksum_conflict(path, expected_checksum, &actual));
    }

    tokio::fs::write(path, content)
        .await
        .map_err(|e| conflict(path, format!("Failed to write file: {e}")))?;
    Ok(())
}

pub async fn guarded_delete(path: &Path, expected_checksum: &str) -> Result<(), ConflictItem> {
    let current = tokio::fs::read_to_string(path)
        .await
        .map_err(|e| conflict(path, format!("Failed to read file: {e}")))?;
    let actual = compute_checksum(&current);
    if actual != expected_checksum {
        return Err(checksum_conflict(path, expected_checksum, &actual));
    }

    tokio::fs::remove_file(path)
        .await
        .map_err(|e| conflict(path, format!("Failed to delete file: {e}")))?;
    Ok(())
}

pub async fn guarded_delete_dir(path: &Path, expected_checksum: &str) -> Result<(), ConflictItem> {
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|e| conflict(path, format!("Failed to stat directory: {e}")))?;
    if !metadata.is_dir() {
        return Err(conflict(path, "Path is not a directory"));
    }

    let actual = compute_directory_checksum(path)
        .await
        .map_err(|e| conflict(path, format!("Failed to checksum directory: {e}")))?;
    if actual != expected_checksum {
        return Err(checksum_conflict(path, expected_checksum, &actual));
    }

    tokio::fs::remove_dir_all(path)
        .await
        .map_err(|e| conflict(path, format!("Failed to delete directory: {e}")))?;
    Ok(())
}

pub async fn guarded_rename(from: &Path, to: &Path) -> Result<(), ConflictItem> {
    if !tokio::fs::try_exists(from)
        .await
        .map_err(|e| conflict(from, format!("Existence check failed: {e}")))?
    {
        return Err(conflict(from, "Source file does not exist"));
    }

    if tokio::fs::try_exists(to)
        .await
        .map_err(|e| conflict(to, format!("Existence check failed: {e}")))?
    {
        return Err(conflict(to, "Destination file already exists"));
    }

    if let Some(parent) = to.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| conflict(to, format!("Failed to create parent directories: {e}")))?;
    }

    tokio::fs::rename(from, to)
        .await
        .map_err(|e| conflict(from, format!("Failed to rename file: {e}")))?;
    Ok(())
}

fn conflict(path: &Path, reason: impl Into<String>) -> ConflictItem {
    ConflictItem {
        path: path.to_string_lossy().to_string(),
        reason: reason.into(),
        expected: None,
        actual: None,
    }
}

fn checksum_conflict(path: &Path, expected: &str, actual: &str) -> ConflictItem {
    ConflictItem {
        path: path.to_string_lossy().to_string(),
        reason: format!("Checksum mismatch: expected {expected}, actual {actual}"),
        expected: Some(expected.to_string()),
        actual: Some(actual.to_string()),
    }
}

struct DirectoryEntryChecksum {
    relative_path: String,
    kind: &'static str,
    checksum: Option<String>,
}

fn collect_directory_entries<'a>(
    root: &'a Path,
    dir: &'a Path,
) -> Pin<Box<dyn Future<Output = Result<Vec<DirectoryEntryChecksum>, String>> + Send + 'a>> {
    Box::pin(async move {
        let mut reader = tokio::fs::read_dir(dir)
            .await
            .map_err(|e| format!("Failed to read directory {}: {e}", dir.display()))?;
        let mut entries = Vec::new();

        while let Some(entry) = reader
            .next_entry()
            .await
            .map_err(|e| format!("Failed to read directory {}: {e}", dir.display()))?
        {
            let path = entry.path();
            let file_type = entry
                .file_type()
                .await
                .map_err(|e| format!("Failed to stat {}: {e}", path.display()))?;
            // Skip symlinks: `tokio::fs::read` would follow them out of the
            // vault and contaminate the directory checksum with external
            // file content. The strict vault resolver blocks IPC access to
            // symlinks; ignoring them here keeps the checksum coherent with
            // that view.
            if file_type.is_symlink() {
                continue;
            }
            let relative_path = path
                .strip_prefix(root)
                .map_err(|e| format!("Failed to strip prefix {}: {e}", path.display()))?
                .to_string_lossy()
                .replace('\\', "/");

            if file_type.is_dir() {
                entries.push(DirectoryEntryChecksum {
                    relative_path: relative_path.clone(),
                    kind: "dir",
                    checksum: None,
                });
                entries.extend(collect_directory_entries(root, &path).await?);
            } else {
                let bytes = tokio::fs::read(&path)
                    .await
                    .map_err(|e| format!("Failed to read file {}: {e}", path.display()))?;
                entries.push(DirectoryEntryChecksum {
                    relative_path,
                    kind: "file",
                    checksum: Some(blake3::hash(&bytes).to_hex().to_string()),
                });
            }
        }

        Ok(entries)
    })
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{compute_directory_checksum, guarded_create_dir, guarded_delete_dir};

    fn temp_path(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards")
            .as_nanos();
        std::env::temp_dir().join(format!("kuku-ai-{name}-{}-{unique}", std::process::id()))
    }

    #[test]
    fn guarded_directory_helpers_create_and_delete_directories() {
        let root = temp_path("checksum-dir");
        let nested = root.join("notes/subdir");

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("build tokio runtime");

        runtime.block_on(async {
            guarded_create_dir(&nested).await.expect("create directory");
            tokio::fs::write(nested.join("a.md"), "# note")
                .await
                .expect("write nested file");
            assert!(
                tokio::fs::try_exists(&nested)
                    .await
                    .expect("directory exists after create")
            );

            let checksum = compute_directory_checksum(&root.join("notes"))
                .await
                .expect("directory checksum");
            guarded_delete_dir(&root.join("notes"), &checksum)
                .await
                .expect("delete directory");
            assert!(
                !tokio::fs::try_exists(&root.join("notes"))
                    .await
                    .expect("directory removed")
            );
        });

        let _ = std::fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn compute_directory_checksum_skips_symlinks() {
        use std::os::unix::fs::symlink;

        let root = temp_path("checksum-dir-symlink");
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("build tokio runtime");

        runtime.block_on(async {
            guarded_create_dir(&root).await.expect("create directory");
            tokio::fs::write(root.join("a.md"), "a")
                .await
                .expect("write a.md");

            let baseline = compute_directory_checksum(&root)
                .await
                .expect("baseline checksum");

            // Dropping a symlink into the directory must not change the
            // checksum — it's invisible to vault readers, so it must stay
            // invisible to the integrity signal as well.
            symlink("/etc/passwd", root.join("leak")).expect("create symlink");

            let after_symlink = compute_directory_checksum(&root)
                .await
                .expect("checksum after symlink");
            assert_eq!(baseline, after_symlink);
        });

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn guarded_delete_dir_rejects_checksum_mismatch() {
        let root = temp_path("checksum-dir-mismatch");
        let nested = root.join("notes");

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("build tokio runtime");

        runtime.block_on(async {
            guarded_create_dir(&nested).await.expect("create directory");
            tokio::fs::write(nested.join("a.md"), "# note")
                .await
                .expect("write nested file");

            let checksum = compute_directory_checksum(&nested)
                .await
                .expect("directory checksum");
            tokio::fs::write(nested.join("a.md"), "# changed")
                .await
                .expect("rewrite nested file");

            let error = guarded_delete_dir(&nested, &checksum)
                .await
                .expect_err("checksum mismatch should fail");
            assert!(error.reason.contains("Checksum mismatch"));
        });

        let _ = std::fs::remove_dir_all(&root);
    }
}
