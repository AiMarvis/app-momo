use async_trait::async_trait;

use crate::{
    ToolError,
    mutation::MutationPlan,
    tools::{ToolCallContext, ToolDescriptor},
};

#[derive(Debug, Clone)]
pub struct NativeToolResult {
    pub text: String,
    pub mutation: Option<MutationPlan>,
    pub preview_text: Option<String>,
}

#[async_trait]
pub trait AiNativeTool: Send + Sync {
    fn descriptor(&self) -> ToolDescriptor;

    async fn call(
        &self,
        ctx: &ToolCallContext<'_>,
        args: serde_json::Value,
    ) -> Result<NativeToolResult, ToolError>;
}
