use tauri::{AppHandle, Wry};

use crate::types::{ChatMode, EditorContext};

pub struct ToolCallContext<'a> {
    pub app: &'a AppHandle<Wry>,
    pub session_id: &'a str,
    pub mode: ChatMode,
    pub editor_context: &'a EditorContext,
}
