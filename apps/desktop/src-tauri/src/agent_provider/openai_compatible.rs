use std::time::Duration;

use reqwest::{Url, header::CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::plugin_secrets;

const OPENAI_COMPATIBLE_TIMEOUT: Duration = Duration::from_secs(120);
const AGENT_API_KEY_FIELD_PREFIX: &str = "agentApiKey";
const NVIDIA_BASE_URL: &str = "https://integrate.api.nvidia.com/v1";
const OPENAI_BASE_URL: &str = "https://api.openai.com/v1";
const XAI_BASE_URL: &str = "https://api.x.ai/v1";
const DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com/v1";

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiCompatibleConfig {
    provider_id: String,
    provider_name: String,
    base_url: String,
    model: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiCompatiblePlanRequest {
    source_note: String,
    source_markdown: Option<String>,
    #[serde(default)]
    related_outputs: Vec<String>,
    api_config: OpenAiCompatibleConfig,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiCompatibleChatRequest {
    content: String,
    mode: Option<String>,
    api_config: OpenAiCompatibleConfig,
    editor_context: Option<Value>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiCompatibleChatResponse {
    content: String,
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatCompletionChoice>,
}

#[derive(Deserialize)]
struct ChatCompletionChoice {
    message: ChatCompletionMessage,
}

#[derive(Deserialize)]
struct ChatCompletionMessage {
    content: Option<String>,
}

pub async fn create_plan(
    request: OpenAiCompatiblePlanRequest,
) -> super::codex::AgentProviderOutput {
    let prompt = build_plan_prompt(&request);
    match run_chat_completion(&request.api_config, &prompt).await {
        Ok(text) => provider_output_from_text(&text),
        Err(reason) => super::codex::AgentProviderOutput::Failed { reason },
    }
}

pub async fn run_chat(
    request: OpenAiCompatibleChatRequest,
) -> Result<OpenAiCompatibleChatResponse, String> {
    let content = request.content.trim();
    if content.is_empty() {
        return Err("Agent API chat prompt is empty".to_string());
    }

    let prompt = build_chat_prompt(&request, content);
    let content = run_chat_completion(&request.api_config, &prompt).await?;
    if content.trim().is_empty() {
        return Err("Agent API returned no response".to_string());
    }
    Ok(OpenAiCompatibleChatResponse { content })
}

pub fn agent_api_key_status(config: &OpenAiCompatibleConfig) -> Result<bool, String> {
    if !provider_uses_api_key(config)? {
        return Ok(false);
    }
    let field_name = agent_api_key_field(config)?;
    plugin_secrets::has_plugin_secret(super::AI_CHAT_PLUGIN_ID, &field_name)
        .map_err(|error| error.to_string())
}

pub fn write_agent_api_key(config: &OpenAiCompatibleConfig, api_key: &str) -> Result<(), String> {
    if !provider_uses_api_key(config)? {
        return Err(format!(
            "{} does not use an Agent API key",
            config.provider_name
        ));
    }
    let field_name = agent_api_key_field(config)?;
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return delete_agent_api_key(config);
    }
    plugin_secrets::write_plugin_secret(super::AI_CHAT_PLUGIN_ID, &field_name, trimmed)
        .map_err(|error| error.to_string())
}

pub fn delete_agent_api_key(config: &OpenAiCompatibleConfig) -> Result<(), String> {
    if !provider_uses_api_key(config)? {
        return Ok(());
    }
    let field_name = agent_api_key_field(config)?;
    match plugin_secrets::delete_plugin_secret(super::AI_CHAT_PLUGIN_ID, &field_name) {
        Ok(()) | Err(plugin_secrets::PluginSecretError::NotFound) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

async fn run_chat_completion(
    config: &OpenAiCompatibleConfig,
    prompt: &str,
) -> Result<String, String> {
    let endpoint = chat_completions_url(config)?;
    let model = config.model.trim();
    if model.is_empty() {
        return Err("Agent API model is required".to_string());
    }

    let api_key = agent_api_key(config)?;
    send_chat_completion(config, &endpoint, model, prompt, api_key.as_deref()).await
}

async fn send_chat_completion(
    config: &OpenAiCompatibleConfig,
    endpoint: &str,
    model: &str,
    prompt: &str,
    api_key: Option<&str>,
) -> Result<String, String> {
    let payload = json!({
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            },
        ],
        "temperature": 0.2,
        "stream": false,
    });
    let body = serde_json::to_vec(&payload)
        .map_err(|error| format!("Agent API request failed: {error}"))?;
    let client = reqwest::Client::builder()
        .timeout(OPENAI_COMPATIBLE_TIMEOUT)
        .build()
        .map_err(|error| format!("Agent API client failed: {error}"))?;
    let mut request = client
        .post(endpoint)
        .header(CONTENT_TYPE, "application/json");
    if let Some(api_key) = api_key {
        request = request.bearer_auth(api_key);
    }

    let response = request
        .body(body)
        .send()
        .await
        .map_err(|error| format!("{} request failed: {error}", config.provider_name))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("{} response failed: {error}", config.provider_name))?;
    if !status.is_success() {
        return Err(format!(
            "{} API returned HTTP {status}",
            config.provider_name
        ));
    }
    let parsed: ChatCompletionResponse = serde_json::from_str(&text)
        .map_err(|error| format!("{} returned invalid JSON: {error}", config.provider_name))?;
    parsed
        .choices
        .into_iter()
        .find_map(|choice| choice.message.content)
        .map(|content| content.trim().to_string())
        .filter(|content| !content.is_empty())
        .ok_or_else(|| format!("{} returned no message content", config.provider_name))
}

fn agent_api_key(config: &OpenAiCompatibleConfig) -> Result<Option<String>, String> {
    if !provider_uses_api_key(config)? {
        return Ok(None);
    }
    let field_name = agent_api_key_field(config)?;
    match plugin_secrets::read_plugin_secret(super::AI_CHAT_PLUGIN_ID, &field_name)
        .map_err(|error| error.to_string())?
    {
        Some(key) if !key.trim().is_empty() => Ok(Some(key)),
        _ if !provider_requires_configured_api_key(config)? => Ok(None),
        _ => Err(format!(
            "{} API key is not configured",
            config.provider_name
        )),
    }
}

fn agent_api_key_field(config: &OpenAiCompatibleConfig) -> Result<String, String> {
    let provider_id = known_provider_id(config.provider_id.trim())?;
    let base_url = comparable_base_url(&config.base_url)?;
    let mut hasher = Sha256::new();
    hasher.update(provider_id.as_bytes());
    hasher.update(b"\n");
    hasher.update(base_url.as_bytes());
    let digest = hex::encode(hasher.finalize());
    Ok(format!(
        "{AGENT_API_KEY_FIELD_PREFIX}.{provider_id}.{}",
        &digest[..16]
    ))
}

fn provider_uses_api_key(config: &OpenAiCompatibleConfig) -> Result<bool, String> {
    validate_provider_base_url(config)?;
    Ok(config.provider_id != "lm_studio")
}

fn provider_requires_configured_api_key(config: &OpenAiCompatibleConfig) -> Result<bool, String> {
    if !provider_uses_api_key(config)? {
        return Ok(false);
    }
    Ok(!allows_missing_api_key(&config.base_url)?)
}

fn allows_missing_api_key(base_url: &str) -> Result<bool, String> {
    let url = parse_base_url(base_url)?;
    Ok(url.scheme() == "http" && is_loopback_host(url.host_str()))
}

fn chat_completions_url(config: &OpenAiCompatibleConfig) -> Result<String, String> {
    validate_provider_base_url(config)?;
    let url = parse_base_url(&config.base_url)?;
    if url.scheme() == "https" || (url.scheme() == "http" && is_loopback_host(url.host_str())) {
        return Ok(format!(
            "{}/chat/completions",
            comparable_base_url(&config.base_url)?
        ));
    }
    Err("Agent API base URL must be HTTPS or localhost HTTP".to_string())
}

fn parse_base_url(base_url: &str) -> Result<Url, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Agent API base URL is required".to_string());
    }
    let url =
        Url::parse(trimmed).map_err(|error| format!("Agent API base URL is invalid: {error}"))?;
    if url.query().is_some() || url.fragment().is_some() {
        return Err("Agent API base URL must not include query or fragment".to_string());
    }
    Ok(url)
}

fn validate_provider_base_url(config: &OpenAiCompatibleConfig) -> Result<(), String> {
    let provider_id = known_provider_id(config.provider_id.trim())?;
    match provider_id {
        "nvidia" => require_base_url(config, NVIDIA_BASE_URL),
        "openai" => require_base_url(config, OPENAI_BASE_URL),
        "xai" => require_base_url(config, XAI_BASE_URL),
        "deepseek" => require_base_url(config, DEEPSEEK_BASE_URL),
        "lm_studio" => {
            let url = parse_base_url(&config.base_url)?;
            if is_loopback_host(url.host_str()) {
                Ok(())
            } else {
                Err("LM Studio base URL must use localhost".to_string())
            }
        }
        "custom" => {
            chat_completions_url_for_custom(&config.base_url)?;
            Ok(())
        }
        _ => unreachable!("known_provider_id returned an unknown provider"),
    }
}

fn require_base_url(config: &OpenAiCompatibleConfig, expected: &str) -> Result<(), String> {
    if comparable_base_url(&config.base_url)? == comparable_base_url(expected)? {
        return Ok(());
    }
    Err(format!(
        "{} base URL must be {}. Use Custom OpenAI-compatible for other endpoints.",
        config.provider_name, expected
    ))
}

fn chat_completions_url_for_custom(base_url: &str) -> Result<String, String> {
    let url = parse_base_url(base_url)?;
    if url.scheme() == "https" || (url.scheme() == "http" && is_loopback_host(url.host_str())) {
        return Ok(format!(
            "{}/chat/completions",
            comparable_base_url(base_url)?
        ));
    }
    Err("Agent API base URL must be HTTPS or localhost HTTP".to_string())
}

fn known_provider_id(provider_id: &str) -> Result<&'static str, String> {
    match provider_id {
        "custom" => Ok("custom"),
        "deepseek" => Ok("deepseek"),
        "lm_studio" => Ok("lm_studio"),
        "nvidia" => Ok("nvidia"),
        "openai" => Ok("openai"),
        "xai" => Ok("xai"),
        _ => Err("Agent API provider is unsupported".to_string()),
    }
}

fn comparable_base_url(base_url: &str) -> Result<String, String> {
    let url = parse_base_url(base_url)?;
    let Some(host) = url.host_str() else {
        return Err("Agent API base URL requires a host".to_string());
    };
    let mut normalized = format!("{}://{}", url.scheme(), host.to_ascii_lowercase());
    if let Some(port) = url.port() {
        normalized.push(':');
        normalized.push_str(&port.to_string());
    }
    let path = url.path().trim_end_matches('/');
    if !path.is_empty() {
        normalized.push_str(path);
    }
    Ok(normalized)
}

fn is_loopback_host(host: Option<&str>) -> bool {
    matches!(host, Some("localhost" | "127.0.0.1" | "::1"))
}

fn build_plan_prompt(request: &OpenAiCompatiblePlanRequest) -> String {
    let provider = json!({
        "kind": "openai_api",
        "name": request.api_config.provider_name,
    });
    let provider_inline = match serde_json::to_string(&provider) {
        Ok(value) => value,
        Err(_) => "{}".to_string(),
    };
    let provider = match serde_json::to_string_pretty(&provider) {
        Ok(value) => value,
        Err(_) => "{}".to_string(),
    };
    let source_markdown = match request.source_markdown.as_deref() {
        Some(markdown) => markdown,
        None => "",
    };
    let payload = json!({
        "sourceNote": request.source_note.as_str(),
        "sourceMarkdown": source_markdown,
        "relatedOutputs": &request.related_outputs,
    });
    let payload = match serde_json::to_string_pretty(&payload) {
        Ok(value) => value,
        Err(_) => "{}".to_string(),
    };

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

fn build_chat_prompt(request: &OpenAiCompatibleChatRequest, content: &str) -> String {
    let mode = match request.mode.as_deref() {
        Some(mode) => mode,
        None => "ask",
    };
    let editor_context = match request
        .editor_context
        .as_ref()
        .and_then(|value| serde_json::to_string_pretty(value).ok())
    {
        Some(value) => value,
        None => "{}".to_string(),
    };

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

fn provider_output_from_text(text: &str) -> super::codex::AgentProviderOutput {
    match serde_json::from_str(json_text_candidate(text)) {
        Ok(value) => super::codex::AgentProviderOutput::Plan { value },
        Err(error) => super::codex::AgentProviderOutput::InvalidJson {
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
    match without_opening_fence.strip_suffix("```") {
        Some(value) => value.trim(),
        None => without_opening_fence.trim(),
    }
}

#[cfg(test)]
mod tests;
