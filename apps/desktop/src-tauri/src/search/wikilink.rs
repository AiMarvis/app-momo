use std::collections::HashMap;

pub const RESOLUTION_AMBIGUOUS: &str = "ambiguous";
pub const RESOLUTION_BASENAME: &str = "basename";
pub const RESOLUTION_EXACT: &str = "exact";
pub const RESOLUTION_UNRESOLVED: &str = "unresolved";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocIdentity {
    pub note_uid: i64,
    pub doc_id: String,
    pub normalized_path: String,
    pub basename: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkResolution {
    pub resolved_target_uid: Option<i64>,
    pub resolved_doc_id: Option<String>,
    pub resolution_kind: String,
    pub folder_distance: Option<i64>,
}

impl LinkResolution {
    pub fn unresolved() -> Self {
        Self {
            resolved_target_uid: None,
            resolved_doc_id: None,
            resolution_kind: RESOLUTION_UNRESOLVED.to_string(),
            folder_distance: None,
        }
    }

    pub fn ambiguous() -> Self {
        Self {
            resolved_target_uid: None,
            resolved_doc_id: None,
            resolution_kind: RESOLUTION_AMBIGUOUS.to_string(),
            folder_distance: None,
        }
    }
}

pub struct DocIndex<'a> {
    by_normalized_path: HashMap<String, &'a DocIdentity>,
    by_basename: HashMap<String, Vec<&'a DocIdentity>>,
}

impl<'a> DocIndex<'a> {
    pub fn new(docs: &'a [DocIdentity]) -> Self {
        let mut by_normalized_path = HashMap::new();
        let mut by_basename: HashMap<String, Vec<&DocIdentity>> = HashMap::new();

        for doc in docs {
            by_normalized_path.insert(doc.normalized_path.clone(), doc);
            by_basename
                .entry(doc.basename.clone())
                .or_default()
                .push(doc);
        }

        Self {
            by_normalized_path,
            by_basename,
        }
    }
}

pub fn normalize_link_target(value: &str) -> String {
    let canonical = value.trim().replace('\\', "/").to_lowercase();
    strip_markdown_extension(&canonical)
}

pub fn basename_from_normalized(value: &str) -> String {
    value.split('/').next_back().unwrap_or(value).to_string()
}

pub fn folder_label(path: &str) -> String {
    let idx = path.rfind('/');
    if let Some(idx) = idx {
        path[..idx].to_string()
    } else {
        "Root".to_string()
    }
}

pub fn doc_display_name(path: &str) -> String {
    let last = path.split('/').next_back().unwrap_or(path);
    strip_markdown_extension(last)
}

pub fn folder_distance_between(source_doc_id: &str, candidate_doc_id: &str) -> usize {
    let source_parts = folder_parts(source_doc_id);
    let candidate_parts = folder_parts(candidate_doc_id);

    let mut common = 0usize;
    while common < source_parts.len()
        && common < candidate_parts.len()
        && source_parts[common] == candidate_parts[common]
    {
        common += 1;
    }

    (source_parts.len() - common) + (candidate_parts.len() - common)
}

pub fn to_doc_identity(note_uid: i64, doc_id: String) -> DocIdentity {
    let normalized_path = normalize_link_target(&doc_id);
    let basename = basename_from_normalized(&normalized_path);
    DocIdentity {
        note_uid,
        doc_id,
        normalized_path,
        basename,
    }
}

pub fn resolve_wikilink(
    source_doc_id: &str,
    raw_target: &str,
    index: &DocIndex<'_>,
) -> LinkResolution {
    let normalized_target = normalize_link_target(raw_target);
    if normalized_target.is_empty() {
        return LinkResolution::unresolved();
    }

    if normalized_target.contains('/')
        && let Some(doc) = index.by_normalized_path.get(&normalized_target)
    {
        return LinkResolution {
            resolved_target_uid: Some(doc.note_uid),
            resolved_doc_id: Some(doc.doc_id.clone()),
            resolution_kind: RESOLUTION_EXACT.to_string(),
            folder_distance: Some(folder_distance_between(source_doc_id, &doc.doc_id) as i64),
        };
    }

    let basename = basename_from_normalized(&normalized_target);
    let Some(candidates) = index.by_basename.get(&basename) else {
        return LinkResolution::unresolved();
    };

    if candidates.len() == 1 {
        let doc = candidates[0];
        return LinkResolution {
            resolved_target_uid: Some(doc.note_uid),
            resolved_doc_id: Some(doc.doc_id.clone()),
            resolution_kind: RESOLUTION_BASENAME.to_string(),
            folder_distance: Some(folder_distance_between(source_doc_id, &doc.doc_id) as i64),
        };
    }

    let mut best_doc: Option<&DocIdentity> = None;
    let mut best_distance = usize::MAX;
    let mut has_tie = false;

    for candidate in candidates {
        let distance = folder_distance_between(source_doc_id, &candidate.doc_id);
        if distance < best_distance {
            best_doc = Some(candidate);
            best_distance = distance;
            has_tie = false;
        } else if distance == best_distance {
            has_tie = true;
        }
    }

    if has_tie {
        return LinkResolution::ambiguous();
    }

    let Some(doc) = best_doc else {
        return LinkResolution::unresolved();
    };

    LinkResolution {
        resolved_target_uid: Some(doc.note_uid),
        resolved_doc_id: Some(doc.doc_id.clone()),
        resolution_kind: RESOLUTION_BASENAME.to_string(),
        folder_distance: Some(best_distance as i64),
    }
}

fn strip_markdown_extension(value: &str) -> String {
    if let Some(stripped) = strip_ascii_suffix(value, ".markdown") {
        return stripped.to_string();
    }
    if let Some(stripped) = strip_ascii_suffix(value, ".md") {
        return stripped.to_string();
    }
    value.to_string()
}

fn strip_ascii_suffix<'a>(value: &'a str, suffix: &str) -> Option<&'a str> {
    let lower = value.to_ascii_lowercase();
    if lower.ends_with(suffix) {
        return Some(&value[..value.len() - suffix.len()]);
    }
    None
}

fn folder_parts(path: &str) -> Vec<&str> {
    let mut parts: Vec<&str> = path.split('/').collect();
    if !parts.is_empty() {
        parts.pop();
    }
    parts.into_iter().filter(|part| !part.is_empty()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn docs(paths: &[&str]) -> Vec<DocIdentity> {
        paths
            .iter()
            .enumerate()
            .map(|(idx, path)| to_doc_identity((idx + 1) as i64, (*path).to_string()))
            .collect()
    }

    #[test]
    fn prefers_exact_path_match() {
        let docs = docs(&["notes/alpha.md", "other/alpha.md"]);
        let index = DocIndex::new(&docs);
        let result = resolve_wikilink("daily/today.md", "notes/alpha", &index);
        assert_eq!(result.resolved_doc_id.as_deref(), Some("notes/alpha.md"));
        assert_eq!(result.resolution_kind, RESOLUTION_EXACT);
    }

    #[test]
    fn uses_unique_basename_match() {
        let docs = docs(&["notes/alpha.md"]);
        let index = DocIndex::new(&docs);
        let result = resolve_wikilink("daily/today.md", "alpha", &index);
        assert_eq!(result.resolved_doc_id.as_deref(), Some("notes/alpha.md"));
        assert_eq!(result.resolution_kind, RESOLUTION_BASENAME);
    }

    #[test]
    fn chooses_closest_folder_candidate() {
        let docs = docs(&["area/alpha.md", "area/sub/alpha.md", "other/alpha.md"]);
        let index = DocIndex::new(&docs);
        let result = resolve_wikilink("area/sub/note.md", "alpha", &index);
        assert_eq!(result.resolved_doc_id.as_deref(), Some("area/sub/alpha.md"));
        assert_eq!(result.folder_distance, Some(0));
    }

    #[test]
    fn reports_ambiguous_ties() {
        let docs = docs(&["left/alpha.md", "right/alpha.md"]);
        let index = DocIndex::new(&docs);
        let result = resolve_wikilink("root/note.md", "alpha", &index);
        assert_eq!(result.resolution_kind, RESOLUTION_AMBIGUOUS);
        assert!(result.resolved_doc_id.is_none());
    }

    #[test]
    fn reports_unresolved_when_missing() {
        let docs = docs(&["notes/alpha.md"]);
        let index = DocIndex::new(&docs);
        let result = resolve_wikilink("root/note.md", "beta", &index);
        assert_eq!(result.resolution_kind, RESOLUTION_UNRESOLVED);
    }

    #[test]
    fn unicode_names_without_extension_do_not_panic() {
        assert_eq!(normalize_link_target("정리1"), "정리1");
        assert_eq!(doc_display_name("notes/정리1"), "정리1");
    }

    #[test]
    fn strips_markdown_extension_from_unicode_names() {
        assert_eq!(normalize_link_target("폴더/정리1.MD"), "폴더/정리1");
        assert_eq!(doc_display_name("notes/정리1.markdown"), "정리1");
    }
}
