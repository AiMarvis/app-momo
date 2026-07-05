mod chunk;
mod extract;
mod normalize;
mod plan;
mod snippet;
mod wikilink;

pub use chunk::{CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS, split_chunk_text};
pub use extract::{
    ChunkKind, ExtractedChunk, ExtractedDocument, FrontmatterEntry, Section, extract_document,
};
pub use normalize::{contains_cjk, is_cjk_char, normalize_text};
pub use plan::{QueryRoute, SimpleQueryPlan, build_fts_query, plan_simple_query};
pub use snippet::{build_snippet, build_snippet_for_range};
pub use wikilink::{ExtractedWikilink, extract_wikilinks};
