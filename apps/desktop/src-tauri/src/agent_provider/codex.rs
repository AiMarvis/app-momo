use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

const CODEX_PLAN_TIMEOUT: Duration = Duration::from_secs(120);
const CODEX_CHAT_TIMEOUT: Duration = Duration::from_secs(120);
const CODEX_EXEC_BASE_ARGS: &[&str] = &["exec"];
const CODEX_EXEC_OUTPUT_ARGS: &[&str] =
    &["--ephemeral", "--skip-git-repo-check", "--output-last-message"];

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentPlanRequest {
    source_note: String,
    source_markdown: Option<String>,
    #[serde(default)]
    related_outputs: Vec<String>,
    codex_config: Option<CodexExecConfig>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CodexChatRequest {
    content: String,
    mode: Option<String>,
    codex_config: Option<CodexExecConfig>,
    editor_context: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum CodexSandboxMode {
    ReadOnly,
    WorkspaceWrite,
    DangerFullAccess,
}

impl CodexSandboxMode {
    const fn as_arg(&self) -> &'static str {
        match self {
            Self::ReadOnly => "read-only",
            Self::WorkspaceWrite => "workspace-write",
            Self::DangerFullAccess => "danger-full-access",
        }
    }
}

impl Default for CodexSandboxMode {
    fn default() -> Self {
        Self::ReadOnly
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct CodexExecConfig {
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    sandbox: CodexSandboxMode,
}

impl Default for CodexExecConfig {
    fn default() -> Self {
        Self {
            model: None,
            sandbox: CodexSandboxMode::ReadOnly,
        }
    }
}

impl CodexExecConfig {
    fn model_arg(&self) -> Option<&str> {
        self.model
            .as_deref()
            .map(str::trim)
            .filter(|model| !model.is_empty())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexChatResponse {
    content: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AgentProviderOutput {
    Failed { reason: String },
    InvalidJson { errors: Vec<String> },
    Plan { value: Value },
}

pub async fn create_codex_plan(request: AgentPlanRequest) -> AgentProviderOutput {
    let output_path = provider_temp_output_path("momo-codex-plan");
    let prompt = build_plan_prompt(&request, "codex_cli", "codex");
    let codex_config = request.codex_config.as_ref().cloned().unwrap_or_default();
    match run_codex_exec_prompt(&prompt, &output_path, CODEX_PLAN_TIMEOUT, "plan", &codex_config)
        .await
    {
        Ok(text) => provider_output_from_text(&text),
        Err(reason) => failed(reason),
    }
}

pub async fn run_codex_chat(request: CodexChatRequest) -> Result<CodexChatResponse, String> {
    let content = request.content.trim();
    if content.is_empty() {
        return Err("Codex chat prompt is empty".to_string());
    }

    let output_path = provider_temp_output_path("momo-codex-chat");
    let prompt = build_chat_prompt(&request, content);
    let codex_config = request.codex_config.as_ref().cloned().unwrap_or_default();
    let text =
        run_codex_exec_prompt(&prompt, &output_path, CODEX_CHAT_TIMEOUT, "chat", &codex_config)
            .await?;
    let content = text.trim();
    if content.is_empty() {
        return Err("Codex CLI returned no response".to_string());
    }
    Ok(CodexChatResponse {
        content: content.to_string(),
    })
}

async fn run_codex_exec_prompt(
    prompt: &str,
    output_path: &Path,
    timeout_duration: Duration,
    label: &str,
    codex_config: &CodexExecConfig,
) -> Result<String, String> {
    let Some(codex_path) = super::codex_executable() else {
        return Err("Codex CLI is not installed".to_string());
    };
    run_codex_exec_prompt_with_path(
        &codex_path,
        prompt,
        output_path,
        timeout_duration,
        label,
        codex_config,
    )
    .await
}

async fn run_codex_exec_prompt_with_path(
    codex_path: &Path,
    prompt: &str,
    output_path: &Path,
    timeout_duration: Duration,
    label: &str,
    codex_config: &CodexExecConfig,
) -> Result<String, String> {
    let child = Command::new(codex_path)
        .args(codex_exec_args(codex_config, output_path))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn();

    let mut child = match child {
        Ok(child) => child,
        Err(_) => return Err(format!("Codex {label} command could not start")),
    };

    let Some(mut stdin) = child.stdin.take() else {
        let _ = std::fs::remove_file(output_path);
        return Err(format!("Codex {label} command could not receive input"));
    };
    if stdin.write_all(prompt.as_bytes()).await.is_err() {
        let _ = std::fs::remove_file(output_path);
        return Err(format!("Codex {label} command input failed"));
    }
    drop(stdin);

    let output = match timeout(timeout_duration, child.wait_with_output()).await {
        Ok(Ok(output)) => output,
        Ok(Err(_)) => {
            let _ = std::fs::remove_file(output_path);
            return Err(format!("Codex {label} command failed"));
        }
        Err(_) => {
            let _ = std::fs::remove_file(output_path);
            return Err(format!("Codex {label} command timed out"));
        }
    };

    if !output.status.success() {
        let _ = std::fs::remove_file(output_path);
        return Err(format!(
            "Codex {label} command failed with exit code {}",
            output
                .status
                .code()
                .map_or_else(|| "unknown".to_string(), |code| code.to_string())
        ));
    }

    let text = std::fs::read_to_string(output_path)
        .unwrap_or_else(|_| String::from_utf8_lossy(&output.stdout).to_string());
    let _ = std::fs::remove_file(output_path);
    Ok(text)
}

fn codex_exec_args(codex_config: &CodexExecConfig, output_path: &Path) -> Vec<OsString> {
    let mut args = Vec::new();
    args.extend(CODEX_EXEC_BASE_ARGS.iter().map(OsString::from));
    if let Some(model) = codex_config.model_arg() {
        args.push(OsString::from("--model"));
        args.push(OsString::from(model));
    }
    args.push(OsString::from("--sandbox"));
    args.push(OsString::from(codex_config.sandbox.as_arg()));
    args.extend(CODEX_EXEC_OUTPUT_ARGS.iter().map(OsString::from));
    args.push(output_path.as_os_str().to_os_string());
    args.push(OsString::from("-"));
    args
}

fn build_plan_prompt(
    request: &AgentPlanRequest,
    provider_kind: &'static str,
    provider_name: &'static str,
) -> String {
    let payload = json!({
        "sourceNote": request.source_note.as_str(),
        "sourceMarkdown": request.source_markdown.as_deref().unwrap_or(""),
        "relatedOutputs": &request.related_outputs,
    });
    let payload = serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".to_string());
    let provider = serde_json::json!({
        "kind": provider_kind,
        "name": provider_name,
    });
    let provider_inline = serde_json::to_string(&provider).unwrap_or_else(|_| "{}".to_string());
    let provider = serde_json::to_string_pretty(&provider).unwrap_or_else(|_| "{}".to_string());

    format!(
        r#"You are Momo's Organize Inbox planner. Return only one JSON object, with no Markdown fence and no commentary.

The JSON object must use exactly these root keys:
- summary: short string
- sourceNote: exactly "{source_note}"
- provider: object exactly matching this JSON object:
{provider}
- creates: array of safe create/link objects
- updates: array containing one mark_inbox_processed object
- approvalRequired: array

Do not flatten provider fields into dot-separated root keys; "provider" must be a nested object.

Required root shape sketch:
{{
  "summary": "...",
  "sourceNote": "{source_note}",
  "provider": {provider_inline},
  "creates": [],
  "updates": [],
  "approvalRequired": []
}}

Allowed create objects:
- managed_task: kind, title, sourceNote, status ("todo" or "done"), path, important, optional due, optional project
- build_issue: kind, title, sourceNote, status ("backlog", "todo", "doing", or "done"), priority ("low", "medium", or "high"), path, blocked, optional due, optional project
- project: kind, title, sourceNote, projectType ("life" or "build"), path
- schedule_block: kind, title, sourceNote, start, end, path
- planning_candidate: kind, title, sourceNote, path
- note_link: kind, title, sourceNote, target, relation ("source" or "related")

Path rules:
- all paths must be safe vault-relative Markdown paths ending in .md
- do not use absolute paths, backslashes, empty segments, "." or ".."
- every create sourceNote must exactly match "{source_note}"
- do not delete, move, rename, or update existing notes

Use approvalRequired only for unsafe operations. For this one-note safe run, prefer safe creates plus mark_inbox_processed. The mark_inbox_processed update must include organizedInto listing the created paths.

Source payload:
{payload}
"#,
        source_note = request.source_note,
        provider = provider,
        provider_inline = provider_inline,
        payload = payload
    )
}

fn build_chat_prompt(request: &CodexChatRequest, content: &str) -> String {
    let mode = request.mode.as_deref().unwrap_or("ask");
    let editor_context = request
        .editor_context
        .as_ref()
        .and_then(|value| serde_json::to_string_pretty(value).ok())
        .unwrap_or_else(|| "{}".to_string());

    format!(
        r#"You are Momo's desktop AI chat assistant. Answer the user's message directly and concisely. Use editor context only when it helps.

Mode: {mode}

Editor context:
{editor_context}

User message:
{content}
"#
    )
}

fn provider_temp_output_path(prefix: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "{prefix}-{}-{}.json",
        std::process::id(),
        chrono::Utc::now().timestamp_micros()
    ))
}

fn provider_output_from_text(text: &str) -> AgentProviderOutput {
    match serde_json::from_str(json_text_candidate(text)) {
        Ok(value) => AgentProviderOutput::Plan { value },
        Err(error) => AgentProviderOutput::InvalidJson {
            errors: vec![format!("Provider returned invalid JSON: {error}")],
        },
    }
}

fn json_text_candidate(text: &str) -> &str {
    let trimmed = text.trim();
    if !trimmed.starts_with("```") {
        return trimmed;
    }
    let Some(first_newline) = trimmed.find('\n') else {
        return trimmed;
    };
    let without_opening_fence = trimmed[first_newline + 1..].trim();
    without_opening_fence
        .strip_suffix("```")
        .unwrap_or(without_opening_fence)
        .trim()
}

fn failed(reason: impl Into<String>) -> AgentProviderOutput {
    AgentProviderOutput::Failed {
        reason: reason.into(),
    }
}

#[cfg(test)]
mod tests;
