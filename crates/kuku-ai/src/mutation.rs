use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationPlan {
    pub summary: String,
    pub operations: Vec<MutationOp>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MutationOp {
    CreateFile {
        path: String,
        content: String,
    },
    CreateDirectory {
        path: String,
    },
    ReplaceFile {
        path: String,
        content: String,
        expected_checksum: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        before_excerpt: Option<String>,
    },
    DeleteFile {
        path: String,
        expected_checksum: String,
    },
    DeleteDirectory {
        path: String,
        expected_checksum: String,
    },
    RenameFile {
        from: String,
        to: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictItem {
    pub path: String,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum MutationApplyResult {
    Applied {
        summary: String,
        #[serde(default)]
        warnings: Vec<String>,
    },
    PartiallyApplied {
        summary: String,
        #[serde(default)]
        applied: Vec<String>,
        #[serde(default)]
        failed: Vec<String>,
        #[serde(default)]
        skipped: Vec<String>,
        #[serde(default)]
        warnings: Vec<String>,
    },
    Conflict {
        summary: String,
        #[serde(default)]
        conflicts: Vec<ConflictItem>,
    },
}
