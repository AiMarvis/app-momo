use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::types::ChatMode;

const INLINE_EDIT_TOOL_ID: &str = "builtin.edit_file";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ToolAccess {
    ReadOnly,
    ProposesMutation,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ToolSource {
    Native,
    Proxy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDescriptor {
    pub tool_id: String,
    pub name: String,
    pub description: String,
    pub parameters: Value,
    pub category: String,
    pub access: ToolAccess,
    pub source: ToolSource,
}

pub fn allowed_tools(mode: ChatMode, descriptors: &[ToolDescriptor]) -> Vec<ToolDescriptor> {
    match mode {
        ChatMode::Agent => descriptors.to_vec(),
        ChatMode::Ask => descriptors
            .iter()
            .filter(|tool| tool.access == ToolAccess::ReadOnly)
            .cloned()
            .collect(),
        ChatMode::Inline => descriptors
            .iter()
            .filter(|tool| {
                tool.access == ToolAccess::ReadOnly
                    || tool.tool_id == INLINE_EDIT_TOOL_ID
                    || tool.name == "edit_file"
            })
            .cloned()
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{ToolAccess, ToolDescriptor, ToolSource, allowed_tools};
    use crate::types::ChatMode;

    fn tool(name: &str, tool_id: &str, access: ToolAccess) -> ToolDescriptor {
        ToolDescriptor {
            tool_id: tool_id.to_string(),
            name: name.to_string(),
            description: format!("{name} tool"),
            parameters: json!({}),
            category: "test".to_string(),
            access,
            source: ToolSource::Native,
        }
    }

    #[test]
    fn inline_mode_allows_read_only_tools_and_edit_file_only() {
        let tools = vec![
            tool("read_file", "builtin.read_file", ToolAccess::ReadOnly),
            tool(
                "edit_file",
                "builtin.edit_file",
                ToolAccess::ProposesMutation,
            ),
            tool(
                "create_file",
                "builtin.create_file",
                ToolAccess::ProposesMutation,
            ),
        ];

        let allowed = allowed_tools(ChatMode::Inline, &tools);
        let names = allowed
            .iter()
            .map(|tool| tool.name.as_str())
            .collect::<Vec<_>>();

        assert_eq!(names, vec!["read_file", "edit_file"]);
    }

    #[test]
    fn ask_mode_allows_only_read_only_tools() {
        let tools = vec![
            tool("read_file", "builtin.read_file", ToolAccess::ReadOnly),
            tool(
                "edit_file",
                "builtin.edit_file",
                ToolAccess::ProposesMutation,
            ),
        ];

        let allowed = allowed_tools(ChatMode::Ask, &tools);
        let names = allowed
            .iter()
            .map(|tool| tool.name.as_str())
            .collect::<Vec<_>>();

        assert_eq!(names, vec!["read_file"]);
    }
}
