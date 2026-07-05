use super::*;

#[test]
fn provider_output_accepts_fenced_json() {
    let result = provider_output_from_text("```json\n{\"summary\":\"ok\"}\n```");

    assert_eq!(
        result,
        AgentProviderOutput::Plan {
            value: json!({ "summary": "ok" })
        }
    );
}

#[test]
fn plan_prompt_requires_nested_provider_object() {
    let request = AgentPlanRequest {
        source_note: "Inbox/raw.md".to_string(),
        source_markdown: Some("Email Joon about the homepage bug.".to_string()),
        related_outputs: Vec::new(),
        codex_config: None,
    };

    let prompt = build_plan_prompt(&request, "codex_cli", "codex");

    assert!(prompt.contains("- provider: object"));
    assert!(prompt.contains("\"provider\": {"));
    assert!(!prompt.contains("- provider.kind:"));
    assert!(!prompt.contains("\"provider.kind\""));
}

#[cfg(unix)]
#[tokio::test]
async fn codex_exec_succeeds_with_current_cli_args() {
    let dir = std::env::temp_dir().join(format!(
        "momo-fake-codex-{}",
        chrono::Utc::now().timestamp_micros()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let codex = dir.join("codex");
    std::fs::write(
        &codex,
        r#"#!/bin/sh
out=""
previous=""
for arg in "$@"; do
  if [ "$previous" = "--output-last-message" ]; then
    out="$arg"
  fi
  previous="$arg"
done
cat >/dev/null
printf 'MOMO_FAKE_CODEX_OK' > "$out"
"#,
    )
    .unwrap();
    make_test_executable(&codex);
    let output_path = dir.join("last-message.txt");

    let result = run_codex_exec_prompt_with_path(
        &codex,
        "reply ok",
        &output_path,
        Duration::from_secs(2),
        "chat",
        &CodexExecConfig::default(),
    )
    .await;

    std::fs::remove_dir_all(&dir).unwrap();
    assert_eq!(result, Ok("MOMO_FAKE_CODEX_OK".to_string()));
}

#[test]
fn codex_exec_args_include_configured_model_and_sandbox() {
    let output_path = PathBuf::from("/tmp/momo-last-message.txt");
    let config = CodexExecConfig {
        model: Some("gpt-5.5".to_string()),
        sandbox: CodexSandboxMode::WorkspaceWrite,
    };

    let args: Vec<String> = codex_exec_args(&config, &output_path)
        .into_iter()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();

    assert_eq!(
        args,
        vec![
            "exec",
            "--model",
            "gpt-5.5",
            "--sandbox",
            "workspace-write",
            "--ephemeral",
            "--skip-git-repo-check",
            "--output-last-message",
            "/tmp/momo-last-message.txt",
            "-",
        ]
    );
}

#[test]
fn codex_exec_args_omit_empty_model() {
    let output_path = PathBuf::from("/tmp/momo-last-message.txt");
    let config = CodexExecConfig {
        model: Some("   ".to_string()),
        sandbox: CodexSandboxMode::ReadOnly,
    };

    let args: Vec<String> = codex_exec_args(&config, &output_path)
        .into_iter()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();

    assert_eq!(
        args,
        vec![
            "exec",
            "--sandbox",
            "read-only",
            "--ephemeral",
            "--skip-git-repo-check",
            "--output-last-message",
            "/tmp/momo-last-message.txt",
            "-",
        ]
    );
}

#[cfg(unix)]
fn make_test_executable(path: &Path) {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = std::fs::metadata(path).unwrap().permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(path, permissions).unwrap();
}
