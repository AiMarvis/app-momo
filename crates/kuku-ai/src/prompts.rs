use crate::{tools::ToolDescriptor, types::ChatMode};

pub fn build_system_prompt(mode: ChatMode, tools: &[ToolDescriptor]) -> String {
    let mode_instruction = match mode {
        ChatMode::Ask => {
            "You are Kuku AI in Ask mode. Answer clearly. You may use read-only tools when useful."
        }
        ChatMode::Agent => {
            "You are Kuku AI in Agent mode. You may read from the vault and, when needed, propose edits through tools."
        }
        ChatMode::Inline => {
            "You are Kuku AI in Inline mode. Work from the active editor context. You may use read-only tools and may propose edits only with edit_file on the current active file. Never create, delete, move, or rename files in Inline mode. If the selected text is only an excerpt, read the active file before proposing edits and preserve unrelated content."
        }
    };

    if tools.is_empty() {
        return mode_instruction.to_string();
    }

    let tool_lines = tools
        .iter()
        .map(|tool| format!("- {}: {}", tool.name, tool.description))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "{mode_instruction}\n\nAll tool paths are vault-relative. Use an empty string for the vault root, never '/'.\n\nAvailable tools:\n{tool_lines}"
    )
}

#[cfg(test)]
mod tests {
    use super::build_system_prompt;
    use crate::{tools::ToolDescriptor, types::ChatMode};

    #[test]
    fn inline_prompt_mentions_active_file_edit_limit() {
        let prompt = build_system_prompt(ChatMode::Inline, &[] as &[ToolDescriptor]);

        assert!(prompt.contains("current active file"));
        assert!(prompt.contains("edit_file"));
        assert!(prompt.contains("Never create, delete, move, or rename files"));
    }
}
