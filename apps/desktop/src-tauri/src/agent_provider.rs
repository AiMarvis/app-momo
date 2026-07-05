use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::Serialize;
use tauri::command;
use tokio::process::Command;
use tokio::time::timeout;

use crate::plugin_secrets;

mod codex;

const CODEX_LOGIN_STATUS_CHECK: &str = "codex login status";
const CODEX_CHECK_TIMEOUT: Duration = Duration::from_secs(6);
const AI_CHAT_PLUGIN_ID: &str = "ai-chat";
const OPENAI_API_KEY_FIELD: &str = "openaiApiKey";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CodexReadinessStatus {
    Ready,
    CodexCliNotFound,
    LoginRequired,
    CheckTimedOut,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexReadiness {
    provider: &'static str,
    status: CodexReadinessStatus,
    ready: bool,
    check_name: &'static str,
    exit_code: Option<i32>,
    timed_out: bool,
    checked_at_ms: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiApiKeyStatus {
    configured: bool,
}

#[command]
pub async fn agent_check_codex_readiness() -> CodexReadiness {
    check_codex_readiness().await
}

#[command]
pub async fn agent_get_openai_api_key_status() -> Result<OpenAiApiKeyStatus, String> {
    openai_api_key_status()
}

#[command]
pub async fn agent_set_openai_api_key(api_key: String) -> Result<OpenAiApiKeyStatus, String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        delete_openai_api_key()?;
    } else {
        plugin_secrets::write_plugin_secret(AI_CHAT_PLUGIN_ID, OPENAI_API_KEY_FIELD, trimmed)
            .map_err(|error| error.to_string())?;
    }
    openai_api_key_status()
}

#[command]
pub async fn agent_clear_openai_api_key() -> Result<OpenAiApiKeyStatus, String> {
    delete_openai_api_key()?;
    openai_api_key_status()
}

#[command]
pub async fn agent_create_codex_plan(
    request: codex::AgentPlanRequest,
) -> codex::AgentProviderOutput {
    codex::create_codex_plan(request).await
}

#[command]
pub async fn agent_run_codex_chat(
    request: codex::CodexChatRequest,
) -> Result<codex::CodexChatResponse, String> {
    codex::run_codex_chat(request).await
}

async fn check_codex_readiness() -> CodexReadiness {
    if codex_executable().is_none() {
        return readiness(CodexReadinessStatus::CodexCliNotFound, None, false);
    }

    match run_codex_login_status().await {
        CodexStatusCommand::Ready(exit_code) => {
            readiness(CodexReadinessStatus::Ready, exit_code, false)
        }
        CodexStatusCommand::LoginRequired(exit_code) => {
            readiness(CodexReadinessStatus::LoginRequired, exit_code, false)
        }
        CodexStatusCommand::TimedOut => readiness(CodexReadinessStatus::CheckTimedOut, None, true),
    }
}

async fn run_codex_login_status() -> CodexStatusCommand {
    let Some(codex_path) = codex_executable() else {
        return CodexStatusCommand::LoginRequired(None);
    };
    let child = match Command::new(codex_path)
        .args(["login", "status"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
    {
        Ok(child) => child,
        Err(_) => return CodexStatusCommand::LoginRequired(None),
    };

    match timeout(CODEX_CHECK_TIMEOUT, child.wait_with_output()).await {
        Ok(Ok(output)) => classify_codex_login_status(
            output.status.success(),
            output.status.code(),
            &output.stdout,
            &output.stderr,
        ),
        Ok(Err(_)) => CodexStatusCommand::LoginRequired(None),
        Err(_) => CodexStatusCommand::TimedOut,
    }
}

fn classify_codex_login_status(
    success: bool,
    exit_code: Option<i32>,
    stdout: &[u8],
    stderr: &[u8],
) -> CodexStatusCommand {
    if !success {
        return CodexStatusCommand::LoginRequired(exit_code);
    }
    if output_mentions_login_required(stdout) || output_mentions_login_required(stderr) {
        return CodexStatusCommand::LoginRequired(exit_code);
    }
    CodexStatusCommand::Ready(exit_code)
}

fn output_mentions_login_required(output: &[u8]) -> bool {
    let text = String::from_utf8_lossy(output).to_ascii_lowercase();
    text.contains("not logged in")
        || text.contains("not signed in")
        || text.contains("login required")
        || text.contains("logged out")
        || text.contains("not authenticated")
}

fn readiness(
    status: CodexReadinessStatus,
    exit_code: Option<i32>,
    timed_out: bool,
) -> CodexReadiness {
    let ready = status == CodexReadinessStatus::Ready;
    CodexReadiness {
        provider: "codex_cli",
        status,
        ready,
        check_name: CODEX_LOGIN_STATUS_CHECK,
        exit_code,
        timed_out,
        checked_at_ms: chrono::Utc::now().timestamp_millis(),
    }
}

#[derive(Debug, PartialEq, Eq)]
enum CodexStatusCommand {
    Ready(Option<i32>),
    LoginRequired(Option<i32>),
    TimedOut,
}

fn codex_executable() -> Option<PathBuf> {
    let path = std::env::var_os("PATH");
    resolve_executable("codex", path.as_deref(), &codex_candidate_paths())
}

fn codex_candidate_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(home) = std::env::var_os("HOME") {
        paths.push(PathBuf::from(home).join(".local/bin/codex"));
    }
    paths.push(PathBuf::from("/opt/homebrew/bin/codex"));
    paths.push(PathBuf::from("/usr/local/bin/codex"));
    paths
}

fn resolve_executable(name: &str, path: Option<&OsStr>, candidates: &[PathBuf]) -> Option<PathBuf> {
    if let Some(path) = path {
        if let Some(found) = std::env::split_paths(path)
            .map(|dir| dir.join(name))
            .find(|candidate| executable_exists(candidate))
        {
            return Some(found);
        }
    }
    candidates
        .iter()
        .find(|candidate| executable_exists(candidate))
        .cloned()
}

fn executable_exists(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    executable_has_execute_bit(path)
}

#[cfg(unix)]
fn executable_has_execute_bit(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    std::fs::metadata(path)
        .map(|metadata| metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn executable_has_execute_bit(path: &Path) -> bool {
    path.is_file()
}

fn openai_api_key_status() -> Result<OpenAiApiKeyStatus, String> {
    plugin_secrets::has_plugin_secret(AI_CHAT_PLUGIN_ID, OPENAI_API_KEY_FIELD)
        .map(|configured| OpenAiApiKeyStatus { configured })
        .map_err(|error| error.to_string())
}

fn delete_openai_api_key() -> Result<(), String> {
    match plugin_secrets::delete_plugin_secret(AI_CHAT_PLUGIN_ID, OPENAI_API_KEY_FIELD) {
        Ok(()) | Err(plugin_secrets::PluginSecretError::NotFound) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(test)]
mod tests;
