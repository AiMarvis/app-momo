use std::fs;
use std::path::{Component, Path, PathBuf};

use tauri::command;

use crate::variant;

// ── Sandbox Path Resolution ──

/// Resolves a relative path within a plugin's sandboxed data directory.
///
/// Uses lexical (component-by-component) path parsing instead of `canonicalize`
/// to prevent path traversal attacks. Each `..` component is checked against
/// the sandbox boundary — if it would escape, the call is rejected immediately.
///
/// Sandbox root: `{variant_data_root}/plugins/{plugin_id}/`
fn validate_plugin_id(plugin_id: &str) -> Result<(), String> {
    if plugin_id.is_empty() || plugin_id.contains('/') || plugin_id.contains('\\') {
        return Err("Invalid plugin ID".into());
    }

    Ok(())
}

fn resolve_sandboxed_path_from_root(
    sandbox: &Path,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let mut resolved = sandbox.to_path_buf();

    for component in Path::new(relative_path).components() {
        match component {
            Component::Normal(c) => resolved.push(c),
            Component::ParentDir => {
                resolved.pop();
                if !resolved.starts_with(sandbox) {
                    return Err(format!(
                        "Path traversal denied: '{relative_path}' escapes plugin sandbox"
                    ));
                }
            }
            Component::CurDir => {} // '.' is a no-op
            // RootDir, Prefix — absolute path components are not allowed
            _ => {
                return Err(format!("Absolute paths not allowed: '{relative_path}'"));
            }
        }
    }

    // Final safety check: resolved path must still be inside sandbox
    if !resolved.starts_with(sandbox) {
        return Err(format!(
            "Path traversal denied: '{relative_path}' resolved outside sandbox"
        ));
    }

    Ok(resolved)
}

/// Reject any symlink component between `sandbox` and `resolved`. `fs::read`
/// and friends follow symlinks, so a crafted `sandbox/link -> /etc/passwd`
/// entry (or intermediate `sandbox/dir -> /etc` with reads under it) would
/// otherwise escape the sandbox despite the lexical resolver. Missing
/// components (e.g. write target not yet created) are OK.
fn reject_symlinks_in_sandbox(sandbox: &Path, resolved: &Path) -> Result<(), String> {
    let relative = resolved
        .strip_prefix(sandbox)
        .map_err(|_| format!("Path not within plugin sandbox: {}", resolved.display()))?;
    let mut current = sandbox.to_path_buf();
    for component in relative.components() {
        let Component::Normal(segment) = component else {
            continue;
        };
        current.push(segment);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(format!(
                    "Symlinks are not allowed in plugin sandbox: {}",
                    current.display()
                ));
            }
            Ok(_) | Err(_) => {}
        }
    }
    Ok(())
}

fn resolve_sandboxed_path(plugin_id: &str, relative_path: &str) -> Result<PathBuf, String> {
    validate_plugin_id(plugin_id)?;

    let home = dirs::home_dir().ok_or("Cannot resolve home directory")?;
    let sandbox = variant::data_root(&home).join("plugins").join(plugin_id);
    let resolved = resolve_sandboxed_path_from_root(&sandbox, relative_path)?;

    // Ensure sandbox directory exists before the symlink scan — otherwise a
    // first-ever plugin write would fail the NotFound branch implicitly
    // instead of going through the normal create path.
    fs::create_dir_all(&sandbox).map_err(|e| format!("Failed to create sandbox dir: {e}"))?;
    reject_symlinks_in_sandbox(&sandbox, &resolved)?;
    Ok(resolved)
}

// ── Tauri Commands ──

#[command]
pub async fn plugin_fs_read_text(plugin_id: String, path: String) -> Result<String, String> {
    let resolved = resolve_sandboxed_path(&plugin_id, &path)?;
    fs::read_to_string(&resolved)
        .map_err(|e| format!("Failed to read '{}': {e}", resolved.display()))
}

#[command]
pub async fn plugin_fs_write_text(
    plugin_id: String,
    path: String,
    content: String,
) -> Result<(), String> {
    let resolved = resolve_sandboxed_path(&plugin_id, &path)?;

    // Ensure parent directories exist
    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dirs: {e}"))?;
    }

    fs::write(&resolved, &content)
        .map_err(|e| format!("Failed to write '{}': {e}", resolved.display()))
}

#[command]
pub async fn plugin_fs_read_binary(plugin_id: String, path: String) -> Result<Vec<u8>, String> {
    let resolved = resolve_sandboxed_path(&plugin_id, &path)?;
    fs::read(&resolved).map_err(|e| format!("Failed to read binary '{}': {e}", resolved.display()))
}

#[command]
pub async fn plugin_fs_write_binary(
    plugin_id: String,
    path: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let resolved = resolve_sandboxed_path(&plugin_id, &path)?;

    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dirs: {e}"))?;
    }

    fs::write(&resolved, &data)
        .map_err(|e| format!("Failed to write binary '{}': {e}", resolved.display()))
}

#[command]
pub async fn plugin_fs_exists(plugin_id: String, path: String) -> Result<bool, String> {
    let resolved = resolve_sandboxed_path(&plugin_id, &path)?;
    Ok(resolved.exists())
}

#[command]
pub async fn plugin_fs_mkdir(plugin_id: String, path: String) -> Result<(), String> {
    let resolved = resolve_sandboxed_path(&plugin_id, &path)?;
    fs::create_dir_all(&resolved)
        .map_err(|e| format!("Failed to create directory '{}': {e}", resolved.display()))
}

#[command]
pub async fn plugin_fs_read_dir(plugin_id: String, path: String) -> Result<Vec<String>, String> {
    let resolved = resolve_sandboxed_path(&plugin_id, &path)?;

    let entries = fs::read_dir(&resolved)
        .map_err(|e| format!("Failed to read directory '{}': {e}", resolved.display()))?;

    let mut names = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read dir entry: {e}"))?;
        if let Some(name) = entry.file_name().to_str() {
            names.push(name.to_string());
        }
    }
    names.sort();
    Ok(names)
}

#[command]
pub async fn plugin_fs_remove(plugin_id: String, path: String) -> Result<(), String> {
    let resolved = resolve_sandboxed_path(&plugin_id, &path)?;

    // Don't allow removing the sandbox root itself
    if resolved == resolve_sandboxed_path(&plugin_id, "")? {
        return Err("Cannot remove plugin root directory".into());
    }

    if resolved.is_dir() {
        fs::remove_dir_all(&resolved)
            .map_err(|e| format!("Failed to remove directory '{}': {e}", resolved.display()))
    } else if resolved.exists() {
        fs::remove_file(&resolved)
            .map_err(|e| format!("Failed to remove file '{}': {e}", resolved.display()))
    } else {
        Ok(()) // Already gone — idempotent
    }
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;

    fn test_sandbox() -> PathBuf {
        std::env::temp_dir()
            .join("kuku-plugin-fs-tests")
            .join("test-plugin")
    }

    #[test]
    fn test_normal_path() {
        let sandbox = test_sandbox();
        let result = resolve_sandboxed_path_from_root(&sandbox, "data/cache.json");
        assert!(result.is_ok());
        let path = result.unwrap();
        assert_eq!(path, sandbox.join("data").join("cache.json"));
    }

    #[test]
    fn test_traversal_blocked() {
        let sandbox = test_sandbox();
        let result = resolve_sandboxed_path_from_root(&sandbox, "../../etc/passwd");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("traversal denied"));
    }

    #[test]
    fn test_sneaky_traversal_blocked() {
        let sandbox = test_sandbox();
        let result = resolve_sandboxed_path_from_root(&sandbox, "foo/../../../etc/passwd");
        assert!(result.is_err());
    }

    #[test]
    fn test_absolute_path_blocked() {
        let sandbox = test_sandbox();
        let result = resolve_sandboxed_path_from_root(&sandbox, "/etc/passwd");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Absolute"));
    }

    #[test]
    fn test_current_dir_ignored() {
        let sandbox = test_sandbox();
        let result = resolve_sandboxed_path_from_root(&sandbox, "./data/./file.txt");
        assert!(result.is_ok());
        let path = result.unwrap();
        assert_eq!(path, sandbox.join("data").join("file.txt"));
    }

    #[test]
    fn test_safe_parent_within_sandbox() {
        // sub/.. should resolve back to sandbox root — that's fine
        let sandbox = test_sandbox();
        let result = resolve_sandboxed_path_from_root(&sandbox, "sub/../file.txt");
        assert!(result.is_ok());
        let path = result.unwrap();
        assert_eq!(path, sandbox.join("file.txt"));
    }

    #[test]
    fn test_invalid_plugin_id() {
        assert!(validate_plugin_id("").is_err());
        assert!(validate_plugin_id("../evil").is_err());
        assert!(validate_plugin_id("a/b").is_err());
        assert!(validate_plugin_id("a\\b").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn reject_symlinks_in_sandbox_blocks_leaf_symlink() {
        use std::os::unix::fs::symlink;
        use std::time::{SystemTime, UNIX_EPOCH};

        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let sandbox = std::env::temp_dir().join(format!("kuku-plugin-fs-symlink-leaf-{stamp}"));
        std::fs::create_dir_all(&sandbox).unwrap();
        symlink("/etc/passwd", sandbox.join("leak")).unwrap();

        let resolved = resolve_sandboxed_path_from_root(&sandbox, "leak").unwrap();
        let error = reject_symlinks_in_sandbox(&sandbox, &resolved).unwrap_err();
        assert!(
            error.contains("Symlinks are not allowed"),
            "unexpected error: {error}"
        );

        let _ = std::fs::remove_dir_all(&sandbox);
    }

    #[cfg(unix)]
    #[test]
    fn reject_symlinks_in_sandbox_blocks_intermediate_symlink() {
        use std::os::unix::fs::symlink;
        use std::time::{SystemTime, UNIX_EPOCH};

        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let sandbox = std::env::temp_dir().join(format!("kuku-plugin-fs-symlink-mid-{stamp}"));
        std::fs::create_dir_all(&sandbox).unwrap();
        symlink("/etc", sandbox.join("dir")).unwrap();

        let resolved = resolve_sandboxed_path_from_root(&sandbox, "dir/passwd").unwrap();
        let error = reject_symlinks_in_sandbox(&sandbox, &resolved).unwrap_err();
        assert!(
            error.contains("Symlinks are not allowed"),
            "unexpected error: {error}"
        );

        let _ = std::fs::remove_dir_all(&sandbox);
    }
}
