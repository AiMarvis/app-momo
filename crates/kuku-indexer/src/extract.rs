use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};
use serde::Serialize;
use serde_json::{Map, Value};

use crate::chunk::split_chunk_text;
use crate::normalize::normalize_text;
use crate::wikilink::{ExtractedWikilink, extract_wikilinks};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FrontmatterEntry {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ChunkKind {
    Prose,
    Code,
    Heading,
}

impl ChunkKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Prose => "Prose",
            Self::Code => "Code",
            Self::Heading => "Heading",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ExtractedChunk {
    pub kind: ChunkKind,
    pub text: String,
    pub raw_text: String,
    pub global_start: usize,
    pub global_end: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Section {
    pub path: Vec<String>,
    pub level: u8,
    pub chunks: Vec<ExtractedChunk>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ExtractedDocument {
    pub title: Option<String>,
    pub frontmatter: Vec<FrontmatterEntry>,
    pub sections: Vec<Section>,
    pub wikilinks: Vec<ExtractedWikilink>,
    pub normalized_text: String,
}

enum BlockKind {
    Paragraph,
    Heading(u8),
    Code,
    BlockQuote,
    Item,
    TableRow,
}

struct BlockBuffer {
    kind: BlockKind,
    raw: String,
}

fn parser_options() -> Options {
    Options::ENABLE_TABLES
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_FOOTNOTES
}

fn split_frontmatter(markdown: &str) -> (Vec<FrontmatterEntry>, String) {
    let mut lines = markdown.lines();
    if lines.next() != Some("---") {
        return (Vec::new(), markdown.to_string());
    }

    let mut yaml_lines = Vec::new();
    let mut body_lines = Vec::new();
    let mut in_frontmatter = true;
    for line in markdown.lines().skip(1) {
        if in_frontmatter && line == "---" {
            in_frontmatter = false;
            continue;
        }
        if in_frontmatter {
            yaml_lines.push(line);
        } else {
            body_lines.push(line);
        }
    }

    if in_frontmatter {
        return (Vec::new(), markdown.to_string());
    }

    let yaml = yaml_lines.join("\n");
    let mut entries = Vec::new();
    if let Ok(value) = serde_yaml::from_str::<serde_yaml::Value>(&yaml) {
        flatten_yaml("", &value, &mut entries, 0);
    }

    (entries, body_lines.join("\n"))
}

const FRONTMATTER_MAX_DEPTH: usize = 32;

fn flatten_yaml(
    prefix: &str,
    value: &serde_yaml::Value,
    out: &mut Vec<FrontmatterEntry>,
    depth: usize,
) {
    if depth >= FRONTMATTER_MAX_DEPTH {
        out.push(FrontmatterEntry {
            key: prefix.to_string(),
            value: serde_yaml::to_string(value)
                .unwrap_or_default()
                .trim()
                .to_string(),
        });
        return;
    }

    match value {
        serde_yaml::Value::Mapping(map) => {
            for (key, child) in map {
                let key = key.as_str().unwrap_or_default();
                let next_prefix = if prefix.is_empty() {
                    key.to_string()
                } else {
                    format!("{prefix}.{key}")
                };
                flatten_yaml(&next_prefix, child, out, depth + 1);
            }
        }
        serde_yaml::Value::Sequence(seq) => {
            for (idx, child) in seq.iter().enumerate() {
                flatten_yaml(&format!("{prefix}[{idx}]"), child, out, depth + 1);
            }
        }
        _ => {
            let value = match value {
                serde_yaml::Value::Null => String::new(),
                serde_yaml::Value::Bool(v) => v.to_string(),
                serde_yaml::Value::Number(v) => v.to_string(),
                serde_yaml::Value::String(v) => v.clone(),
                _ => serde_yaml::to_string(value)
                    .unwrap_or_default()
                    .trim()
                    .to_string(),
            };
            out.push(FrontmatterEntry {
                key: prefix.to_string(),
                value,
            });
        }
    }
}

fn ensure_section(sections: &mut Vec<Section>) -> &mut Section {
    if sections.is_empty() {
        sections.push(Section {
            path: Vec::new(),
            level: 0,
            chunks: Vec::new(),
        });
    }
    sections.last_mut().expect("section exists")
}

fn append_chunk(sections: &mut Vec<Section>, kind: ChunkKind, raw_text: &str, cursor: &mut usize) {
    for raw_part in split_chunk_text(raw_text) {
        let normalized = normalize_text(&raw_part);
        if normalized.is_empty() {
            continue;
        }
        let start = *cursor;
        *cursor += raw_part.chars().count();
        let end = *cursor;
        ensure_section(sections).chunks.push(ExtractedChunk {
            kind,
            text: normalized,
            raw_text: raw_part,
            global_start: start,
            global_end: end,
        });
        *cursor += 1;
    }
}

fn section_path_to_json(path: &[FrontmatterEntry]) -> Map<String, Value> {
    let mut object = Map::new();
    for entry in path {
        object.insert(entry.key.clone(), Value::String(entry.value.clone()));
    }
    object
}

pub fn extract_document(markdown: &str) -> ExtractedDocument {
    let (frontmatter, body) = split_frontmatter(markdown);
    let wikilinks = extract_wikilinks(&body);
    let frontmatter_json = section_path_to_json(&frontmatter);
    let mut title = frontmatter_json
        .get("title")
        .and_then(Value::as_str)
        .map(ToString::to_string);

    let parser = Parser::new_ext(&body, parser_options());
    let mut sections = vec![Section {
        path: Vec::new(),
        level: 0,
        chunks: Vec::new(),
    }];
    let mut heading_stack: Vec<String> = Vec::new();
    let mut buffer: Option<BlockBuffer> = None;
    let mut cursor = 0usize;

    let flush_buffer = |buffer: &mut Option<BlockBuffer>,
                        sections: &mut Vec<Section>,
                        heading_stack: &mut Vec<String>,
                        title: &mut Option<String>,
                        cursor: &mut usize| {
        let Some(block) = buffer.take() else {
            return;
        };
        let raw = block.raw.trim().to_string();
        if raw.is_empty() {
            return;
        }

        match block.kind {
            BlockKind::Heading(level) => {
                if title.is_none() {
                    *title = Some(raw.clone());
                }
                let target_len = level.saturating_sub(1) as usize;
                while heading_stack.len() > target_len {
                    heading_stack.pop();
                }
                heading_stack.push(raw.clone());
                sections.push(Section {
                    path: heading_stack.clone(),
                    level,
                    chunks: Vec::new(),
                });
                append_chunk(sections, ChunkKind::Heading, &raw, cursor);
            }
            BlockKind::Code => append_chunk(sections, ChunkKind::Code, &raw, cursor),
            BlockKind::Paragraph
            | BlockKind::BlockQuote
            | BlockKind::Item
            | BlockKind::TableRow => append_chunk(sections, ChunkKind::Prose, &raw, cursor),
        }
    };

    for event in parser {
        match event {
            Event::Start(tag) => match tag {
                Tag::Paragraph => {
                    buffer = Some(BlockBuffer {
                        kind: BlockKind::Paragraph,
                        raw: String::new(),
                    })
                }
                Tag::Heading { level, .. } => {
                    buffer = Some(BlockBuffer {
                        kind: BlockKind::Heading(level as u8),
                        raw: String::new(),
                    })
                }
                Tag::CodeBlock(kind) => {
                    let mut raw = String::new();
                    if let CodeBlockKind::Fenced(lang) = kind
                        && !lang.is_empty()
                    {
                        raw.push_str(lang.as_ref());
                        raw.push('\n');
                    }
                    buffer = Some(BlockBuffer {
                        kind: BlockKind::Code,
                        raw,
                    });
                }
                Tag::BlockQuote(_) => {
                    buffer = Some(BlockBuffer {
                        kind: BlockKind::BlockQuote,
                        raw: String::new(),
                    })
                }
                Tag::Item => {
                    buffer = Some(BlockBuffer {
                        kind: BlockKind::Item,
                        raw: String::new(),
                    })
                }
                Tag::TableRow => {
                    buffer = Some(BlockBuffer {
                        kind: BlockKind::TableRow,
                        raw: String::new(),
                    })
                }
                _ => {}
            },
            Event::End(
                TagEnd::Paragraph
                | TagEnd::Heading(_)
                | TagEnd::CodeBlock
                | TagEnd::BlockQuote(_)
                | TagEnd::Item
                | TagEnd::TableRow,
            ) => flush_buffer(
                &mut buffer,
                &mut sections,
                &mut heading_stack,
                &mut title,
                &mut cursor,
            ),
            Event::End(_) => {}
            Event::Text(text) | Event::Code(text) => {
                if let Some(block) = &mut buffer {
                    block.raw.push_str(text.as_ref());
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if let Some(block) = &mut buffer {
                    block.raw.push('\n');
                }
            }
            Event::Rule => {
                flush_buffer(
                    &mut buffer,
                    &mut sections,
                    &mut heading_stack,
                    &mut title,
                    &mut cursor,
                );
            }
            _ => {}
        }
    }

    flush_buffer(
        &mut buffer,
        &mut sections,
        &mut heading_stack,
        &mut title,
        &mut cursor,
    );

    let normalized_text = sections
        .iter()
        .flat_map(|section| section.chunks.iter().map(|chunk| chunk.text.clone()))
        .collect::<Vec<_>>()
        .join(" ");

    ExtractedDocument {
        title,
        frontmatter,
        sections,
        wikilinks,
        normalized_text,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_yaml_metadata_block() {
        let document = extract_document("---\ntitle: Demo\ntags:\n  - rust\n---\n# Heading");
        assert_eq!(document.title.as_deref(), Some("Demo"));
        assert!(
            document
                .frontmatter
                .iter()
                .any(|entry| entry.key == "tags[0]" && entry.value == "rust")
        );
    }

    #[test]
    fn flatten_yaml_caps_recursion_depth() {
        let mut nested = String::from("---\n");
        let depth = FRONTMATTER_MAX_DEPTH + 20;
        for idx in 0..depth {
            nested.push_str(&"  ".repeat(idx));
            nested.push_str(&format!("k{idx}:\n"));
        }
        nested.push_str(&"  ".repeat(depth));
        nested.push_str("leaf: value\n---\n# Body");

        let document = extract_document(&nested);
        assert!(!document.frontmatter.is_empty());
    }

    #[test]
    fn extracts_heading_sections() {
        let document = extract_document("# One\ntext\n## Two\nmore");
        assert!(
            document
                .sections
                .iter()
                .any(|section| section.path == vec!["One"])
        );
        assert!(
            document
                .sections
                .iter()
                .any(|section| section.path == vec!["One", "Two"])
        );
    }
}
