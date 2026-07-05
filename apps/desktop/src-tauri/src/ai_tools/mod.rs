mod document_tools;
mod file_tools;
mod search_tools;
mod tool_ids;

use std::sync::Arc;

use kuku_ai::{AiNativeTool, register_tool};
use tauri::AppHandle;

use document_tools::{GetOutlineTool, GetTagsTool};
use file_tools::MoveFileTool;
use file_tools::{CreateFileTool, DeleteFileTool, EditFileTool, ListFilesTool, ReadFileTool};
use search_tools::SearchVaultTool;

pub fn register_all(app: &AppHandle) {
    let tools: Vec<Arc<dyn AiNativeTool>> = vec![
        Arc::new(ReadFileTool),
        Arc::new(ListFilesTool),
        Arc::new(SearchVaultTool),
        Arc::new(CreateFileTool),
        Arc::new(EditFileTool),
        Arc::new(DeleteFileTool),
        Arc::new(MoveFileTool),
        Arc::new(GetOutlineTool),
        Arc::new(GetTagsTool),
    ];

    for tool in tools {
        register_tool(app, tool);
    }
}
