use crate::normalize::{contains_cjk, is_cjk_char, normalize_text};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QueryRoute {
    None,
    MetadataOnly,
    MetadataAndBody,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SimpleQueryPlan {
    pub original_query: String,
    pub normalized_query: String,
    pub route: QueryRoute,
}

fn is_query_token_char(ch: char) -> bool {
    ch.is_alphanumeric() || is_cjk_char(ch)
}

fn tokenize_query_terms(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();

    for ch in input.chars() {
        if is_query_token_char(ch) {
            current.push(ch);
            continue;
        }

        if !current.is_empty() {
            tokens.push(std::mem::take(&mut current));
        }
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

pub fn plan_simple_query(query: &str) -> SimpleQueryPlan {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return SimpleQueryPlan {
            original_query: String::new(),
            normalized_query: String::new(),
            route: QueryRoute::None,
        };
    }

    let normalized = normalize_text(trimmed);
    let char_count = trimmed.chars().count();
    let route = if char_count == 1 {
        QueryRoute::MetadataOnly
    } else if contains_cjk(trimmed) {
        if char_count >= 2 {
            QueryRoute::MetadataAndBody
        } else {
            QueryRoute::MetadataOnly
        }
    } else if normalized.replace(' ', "").chars().count() >= 4 {
        QueryRoute::MetadataAndBody
    } else {
        QueryRoute::MetadataOnly
    };

    SimpleQueryPlan {
        original_query: trimmed.to_string(),
        normalized_query: normalized,
        route,
    }
}

pub fn build_fts_query(plan: &SimpleQueryPlan) -> Option<String> {
    if plan.route != QueryRoute::MetadataAndBody {
        return None;
    }

    let tokens = tokenize_query_terms(&plan.normalized_query);

    if tokens.is_empty() {
        return None;
    }

    Some(
        tokens
            .into_iter()
            .map(|token| format!("{token}*"))
            .collect::<Vec<_>>()
            .join(" "),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_empty_query_to_none() {
        assert_eq!(plan_simple_query("").route, QueryRoute::None);
    }

    #[test]
    fn routes_single_char_to_metadata() {
        assert_eq!(plan_simple_query("a").route, QueryRoute::MetadataOnly);
    }

    #[test]
    fn routes_long_latin_to_body() {
        assert_eq!(
            plan_simple_query("search").route,
            QueryRoute::MetadataAndBody
        );
    }

    #[test]
    fn routes_cjk_two_chars_to_body() {
        assert_eq!(plan_simple_query("검색").route, QueryRoute::MetadataAndBody);
    }

    #[test]
    fn preserves_identifier_boundaries_in_fts_queries() {
        let plan = plan_simple_query("vite-plugin_solid");
        assert_eq!(
            build_fts_query(&plan).as_deref(),
            Some("vite* plugin* solid*")
        );
    }

    #[test]
    fn adds_prefix_matching_for_cjk_terms() {
        let plan = plan_simple_query("검색");
        assert_eq!(build_fts_query(&plan).as_deref(), Some("검색*"));
    }
}
