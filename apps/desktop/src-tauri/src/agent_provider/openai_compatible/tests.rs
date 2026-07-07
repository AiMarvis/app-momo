use super::*;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

fn config(
    provider_id: &str,
    provider_name: &str,
    base_url: &str,
    model: &str,
) -> OpenAiCompatibleConfig {
    OpenAiCompatibleConfig {
        provider_id: provider_id.to_string(),
        provider_name: provider_name.to_string(),
        base_url: base_url.to_string(),
        model: model.to_string(),
    }
}

#[test]
fn chat_completions_url_accepts_https() {
    let config = config(
        "nvidia",
        "NVIDIA NIM",
        "https://integrate.api.nvidia.com/v1",
        "nvidia/nemotron-3-ultra-550b-a55b",
    );

    assert_eq!(
        chat_completions_url(&config).as_deref(),
        Ok("https://integrate.api.nvidia.com/v1/chat/completions")
    );
}

#[test]
fn chat_completions_url_accepts_local_http_for_lm_studio() {
    let config = config(
        "lm_studio",
        "LM Studio",
        "http://localhost:1234/v1",
        "local-model",
    );

    assert_eq!(
        chat_completions_url(&config).as_deref(),
        Ok("http://localhost:1234/v1/chat/completions")
    );
}

#[test]
fn chat_completions_url_rejects_remote_http() {
    let config = config(
        "custom",
        "Custom",
        "http://api.example.com/v1",
        "custom-model",
    );

    assert_eq!(
        chat_completions_url(&config),
        Err("Agent API base URL must be HTTPS or localhost HTTP".to_string())
    );
}

#[test]
fn known_provider_rejects_unexpected_base_url() {
    let config = config(
        "nvidia",
        "NVIDIA NIM",
        "https://api.example.com/v1",
        "nvidia/model",
    );

    assert_eq!(
        chat_completions_url(&config),
        Err(
            "NVIDIA NIM base URL must be https://integrate.api.nvidia.com/v1. Use Custom OpenAI-compatible for other endpoints."
                .to_string()
        )
    );
}

#[test]
fn agent_api_key_field_is_scoped_to_provider_and_base_url() {
    let nvidia = config(
        "nvidia",
        "NVIDIA NIM",
        "https://integrate.api.nvidia.com/v1",
        "nvidia/nemotron-3-ultra-550b-a55b",
    );
    let openai = config("openai", "OpenAI", "https://api.openai.com/v1", "gpt-5.1");
    let custom_a = config("custom", "Custom", "https://api.example.com/v1", "custom-a");
    let custom_b = config(
        "custom",
        "Custom",
        "https://other.example.com/v1",
        "custom-b",
    );

    let nvidia_field = agent_api_key_field(&nvidia).unwrap();
    let openai_field = agent_api_key_field(&openai).unwrap();
    let custom_a_field = agent_api_key_field(&custom_a).unwrap();
    let custom_b_field = agent_api_key_field(&custom_b).unwrap();

    assert!(nvidia_field.starts_with("agentApiKey.nvidia."));
    assert!(openai_field.starts_with("agentApiKey.openai."));
    assert_ne!(nvidia_field, openai_field);
    assert_ne!(custom_a_field, custom_b_field);
}

#[test]
fn lm_studio_never_uses_a_stored_agent_api_key() {
    let config = config(
        "lm_studio",
        "LM Studio",
        "http://localhost:1234/v1",
        "local-model",
    );

    assert_eq!(provider_uses_api_key(&config), Ok(false));
    assert_eq!(agent_api_key(&config), Ok(None));
}

#[test]
fn custom_remote_https_requires_a_configured_key() {
    let config = config(
        "custom",
        "Custom",
        "https://api.example.com/v1",
        "custom-model",
    );

    assert_eq!(provider_requires_configured_api_key(&config), Ok(true));
}

#[test]
fn custom_localhost_can_run_without_a_key() {
    let config = config(
        "custom",
        "Custom",
        "http://127.0.0.1:1234/v1",
        "custom-model",
    );

    assert_eq!(provider_requires_configured_api_key(&config), Ok(false));
}

#[test]
fn provider_output_accepts_fenced_json() {
    let result = provider_output_from_text("```json\n{\"summary\":\"ok\"}\n```");

    assert_eq!(
        result,
        super::super::codex::AgentProviderOutput::Plan {
            value: json!({ "summary": "ok" })
        }
    );
}

#[test]
fn plan_prompt_marks_provider_as_openai_api() {
    let request = OpenAiCompatiblePlanRequest {
        source_note: "Inbox/raw.md".to_string(),
        source_markdown: Some("Email Joon about the homepage bug.".to_string()),
        related_outputs: Vec::new(),
        api_config: config(
            "nvidia",
            "NVIDIA NIM",
            "https://integrate.api.nvidia.com/v1",
            "nvidia/nemotron-3-ultra-550b-a55b",
        ),
    };

    let prompt = build_plan_prompt(&request);

    assert!(prompt.contains("\"kind\": \"openai_api\""));
    assert!(prompt.contains("\"name\": \"NVIDIA NIM\""));
}

#[test]
fn send_chat_completion_sends_scoped_bearer_auth_when_key_is_supplied() {
    let server = TestChatServer::start();
    let config = config("custom", "Custom", &server.base_url, "custom-model");

    let result = block_on(send_chat_completion(
        &config,
        &format!("{}/chat/completions", server.base_url),
        "custom-model",
        "Say hi",
        Some("scoped-secret"),
    ))
    .unwrap();
    let request = server.join();

    assert_eq!(result, "Hello from test server");
    assert!(
        request
            .to_ascii_lowercase()
            .contains("authorization: bearer scoped-secret")
    );
    assert!(request.contains("\"model\":\"custom-model\""));
    assert!(request.contains("\"content\":\"Say hi\""));
}

#[test]
fn send_chat_completion_omits_bearer_auth_when_key_is_absent() {
    let server = TestChatServer::start();
    let config = config("lm_studio", "LM Studio", &server.base_url, "local-model");

    let result = block_on(send_chat_completion(
        &config,
        &format!("{}/chat/completions", server.base_url),
        "local-model",
        "Say hi",
        None,
    ))
    .unwrap();
    let request = server.join();

    assert_eq!(result, "Hello from test server");
    assert!(
        !request
            .to_ascii_lowercase()
            .contains("authorization: bearer")
    );
}

struct TestChatServer {
    base_url: String,
    handle: thread::JoinHandle<String>,
}

impl TestChatServer {
    fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0; 8192];
            let size = stream.read(&mut buffer).unwrap();
            let request = String::from_utf8_lossy(&buffer[..size]).to_string();
            let body = r#"{"choices":[{"message":{"content":"Hello from test server"}}]}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).unwrap();
            request
        });
        Self { base_url, handle }
    }

    fn join(self) -> String {
        self.handle.join().unwrap()
    }
}

fn block_on<T>(future: impl std::future::Future<Output = T>) -> T {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(future)
}
