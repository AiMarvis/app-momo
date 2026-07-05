use super::*;

#[test]
fn readiness_reports_missing_codex_without_exit_code() {
    let result = readiness(CodexReadinessStatus::CodexCliNotFound, None, false);

    assert!(!result.ready);
    assert_eq!(result.status, CodexReadinessStatus::CodexCliNotFound);
    assert_eq!(result.exit_code, None);
    assert!(!result.timed_out);
}

#[test]
fn readiness_reports_login_required_with_exit_code() {
    let result = readiness(CodexReadinessStatus::LoginRequired, Some(1), false);

    assert!(!result.ready);
    assert_eq!(result.status, CodexReadinessStatus::LoginRequired);
    assert_eq!(result.exit_code, Some(1));
}

#[test]
fn readiness_reports_timeout_without_exit_code() {
    let result = readiness(CodexReadinessStatus::CheckTimedOut, None, true);

    assert!(!result.ready);
    assert_eq!(result.status, CodexReadinessStatus::CheckTimedOut);
    assert_eq!(result.exit_code, None);
    assert!(result.timed_out);
}

#[test]
fn zero_exit_logged_out_output_is_login_required() {
    let result = classify_codex_login_status(
        true,
        Some(0),
        b"Not logged in. Run codex login to continue.",
        b"",
    );

    assert_eq!(result, CodexStatusCommand::LoginRequired(Some(0)));
}

#[test]
fn codex_resolver_uses_candidate_when_path_misses() {
    let dir = std::env::temp_dir().join(format!(
        "momo-codex-resolver-{}",
        chrono::Utc::now().timestamp_micros()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let codex = dir.join("codex");
    std::fs::write(&codex, "").unwrap();
    make_test_executable(&codex);

    let result = resolve_executable(
        "codex",
        Some(std::ffi::OsStr::new("/usr/bin:/bin:/usr/sbin:/sbin")),
        &[codex.clone()],
    );

    std::fs::remove_dir_all(&dir).unwrap();
    assert_eq!(result, Some(codex));
}

#[cfg(unix)]
#[test]
fn codex_resolver_ignores_non_executable_candidate() {
    let dir = std::env::temp_dir().join(format!(
        "momo-codex-resolver-non-exec-{}",
        chrono::Utc::now().timestamp_micros()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let codex = dir.join("codex");
    std::fs::write(&codex, "").unwrap();

    let result = resolve_executable(
        "codex",
        Some(std::ffi::OsStr::new("/usr/bin:/bin:/usr/sbin:/sbin")),
        &[codex],
    );

    std::fs::remove_dir_all(&dir).unwrap();
    assert_eq!(result, None);
}

#[cfg(unix)]
fn make_test_executable(path: &Path) {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = std::fs::metadata(path).unwrap().permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(path, permissions).unwrap();
}

#[cfg(not(unix))]
fn make_test_executable(_path: &Path) {}

#[test]
fn readiness_serialization_excludes_command_output() {
    let result = readiness(CodexReadinessStatus::LoginRequired, Some(0), false);
    let json = serde_json::to_string(&result).unwrap();

    assert!(json.contains("\"status\":\"login_required\""));
    assert!(!json.contains("Not logged in"));
    assert!(!json.contains("stdout"));
    assert!(!json.contains("stderr"));
}

#[test]
fn openai_key_uses_plugin_secret_keychain_account() {
    assert_eq!(
        plugin_secrets::secret_account(AI_CHAT_PLUGIN_ID, OPENAI_API_KEY_FIELD).unwrap(),
        "ai-chat:openaiApiKey"
    );
}
