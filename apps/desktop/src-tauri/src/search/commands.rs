use tauri::{State, command};

use crate::models::{
    AdvancedQueryRequest, GraphSnapshot, IndexerConfig, IndexerDebugStatus, IndexerStatus,
    ResolveWikilinkResult, SimpleSearchResult,
};

use super::SearchState;

#[command]
pub async fn search_query_simple(
    state: State<'_, SearchState>,
    query: String,
    max_results: Option<usize>,
) -> Result<SimpleSearchResult, String> {
    state.query_simple(&query, max_results.unwrap_or(20))
}

#[command]
pub async fn search_query_advanced(
    state: State<'_, SearchState>,
    request: AdvancedQueryRequest,
) -> Result<SimpleSearchResult, String> {
    state.query_advanced(&request)
}

#[command]
pub async fn search_get_status(state: State<'_, SearchState>) -> Result<IndexerStatus, String> {
    Ok(state.get_status())
}

#[command]
pub async fn search_get_debug_status(
    state: State<'_, SearchState>,
) -> Result<IndexerDebugStatus, String> {
    Ok(state.get_debug_status())
}

#[command]
pub async fn search_request_rebuild(state: State<'_, SearchState>) -> Result<(), String> {
    state.request_rebuild()
}

#[command]
pub async fn search_get_graph_snapshot(
    state: State<'_, SearchState>,
) -> Result<GraphSnapshot, String> {
    state.get_graph_snapshot()
}

#[command]
pub async fn search_resolve_wikilink(
    state: State<'_, SearchState>,
    source_path: String,
    raw_target: String,
) -> Result<ResolveWikilinkResult, String> {
    state.resolve_wikilink(&source_path, &raw_target)
}

#[command]
pub async fn search_get_config(state: State<'_, SearchState>) -> Result<IndexerConfig, String> {
    Ok(state.get_config())
}

#[command]
pub async fn search_set_config(
    state: State<'_, SearchState>,
    config: IndexerConfig,
) -> Result<(), String> {
    state.set_config(config)
}
