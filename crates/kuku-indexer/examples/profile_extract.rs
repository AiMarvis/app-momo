use std::env;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant};

use kuku_indexer::extract_document;

#[derive(Debug)]
struct Args {
    input: Option<PathBuf>,
    single_file: Option<PathBuf>,
    limit: Option<usize>,
    top: usize,
    synthetic: Option<String>,
}

#[derive(Debug)]
struct FileMetric {
    path: String,
    bytes: usize,
    elapsed: Duration,
    sections: usize,
    chunks: usize,
    wikilinks: usize,
}

#[derive(Debug, Default)]
struct Totals {
    files: usize,
    bytes: usize,
    elapsed: Duration,
    sections: usize,
    chunks: usize,
    wikilinks: usize,
}

fn usage() -> &'static str {
    "usage: profile_extract [--limit n] [--top n] [--single-file path] [--synthetic early-boundary|code-boundary] [vault-or-file]"
}

fn parse_args() -> Result<Args, String> {
    let mut input = None;
    let mut single_file = None;
    let mut limit = None;
    let mut top = 10usize;
    let mut synthetic = None;
    let mut raw = env::args().skip(1);

    while let Some(arg) = raw.next() {
        match arg.as_str() {
            "--help" | "-h" => return Err(usage().to_string()),
            "--limit" => {
                let value = raw
                    .next()
                    .ok_or_else(|| "--limit requires a value".to_string())?;
                limit = Some(
                    value
                        .parse::<usize>()
                        .map_err(|e| format!("invalid --limit value: {e}"))?,
                );
            }
            "--top" => {
                let value = raw
                    .next()
                    .ok_or_else(|| "--top requires a value".to_string())?;
                top = value
                    .parse::<usize>()
                    .map_err(|e| format!("invalid --top value: {e}"))?;
            }
            "--single-file" => {
                let value = raw
                    .next()
                    .ok_or_else(|| "--single-file requires a path".to_string())?;
                single_file = Some(PathBuf::from(value));
            }
            "--synthetic" => {
                synthetic = Some(
                    raw.next()
                        .ok_or_else(|| "--synthetic requires a case name".to_string())?,
                );
            }
            value if value.starts_with('-') => {
                return Err(format!("unknown option: {value}"));
            }
            value => {
                if input.replace(PathBuf::from(value)).is_some() {
                    return Err("only one input path is supported".to_string());
                }
            }
        }
    }

    Ok(Args {
        input,
        single_file,
        limit,
        top,
        synthetic,
    })
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let lower = ext.to_ascii_lowercase();
            lower == "md" || lower == "markdown"
        })
        .unwrap_or(false)
}

fn should_ignore_path(path: &Path) -> bool {
    let mut last_segment = None;
    for component in path.components() {
        if let Component::Normal(name) = component {
            let name = name.to_string_lossy().to_string();
            if name.starts_with('.') {
                return true;
            }
            last_segment = Some(name);
        }
    }

    last_segment
        .is_some_and(|name| name == ".DS_Store" || name.ends_with(".tmp") || name.ends_with('~'))
}

fn collect_markdown_files(dir: &Path, root: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(dir)
        .map_err(|e| format!("failed to read directory {}: {e}", dir.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("failed to read directory entry: {e}"))?;
        let path = entry.path();
        let rel = path.strip_prefix(root).unwrap_or(&path);
        if should_ignore_path(rel) {
            continue;
        }
        if path.is_dir() {
            collect_markdown_files(&path, root, out)?;
            continue;
        }
        if is_markdown_path(&path) {
            out.push(path);
        }
    }
    Ok(())
}

fn display_path(path: &Path, root: Option<&Path>) -> String {
    root.and_then(|root| path.strip_prefix(root).ok())
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn measure_document(path: String, markdown: &str) -> FileMetric {
    let started = Instant::now();
    let document = extract_document(markdown);
    let elapsed = started.elapsed();
    let chunks = document
        .sections
        .iter()
        .map(|section| section.chunks.len())
        .sum();

    FileMetric {
        path,
        bytes: markdown.len(),
        elapsed,
        sections: document.sections.len(),
        chunks,
        wikilinks: document.wikilinks.len(),
    }
}

fn read_and_measure(path: &Path, root: Option<&Path>) -> Result<FileMetric, String> {
    let markdown = fs::read_to_string(path)
        .map_err(|e| format!("failed to read markdown file {}: {e}", path.display()))?;
    Ok(measure_document(display_path(path, root), &markdown))
}

fn synthetic_markdown(case_name: &str) -> Result<String, String> {
    match case_name {
        "early-boundary" => Ok(format!("Short. {}", "a".repeat(50_000))),
        "code-boundary" => Ok(format!("```json\n{}\n```", "a".repeat(50_000))),
        other => Err(format!("unknown synthetic case: {other}")),
    }
}

fn print_top(label: &str, metrics: &[FileMetric], top: usize, key: impl Fn(&FileMetric) -> u128) {
    let mut rows = metrics.iter().collect::<Vec<_>>();
    rows.sort_by(|left, right| {
        key(right)
            .cmp(&key(left))
            .then_with(|| left.path.cmp(&right.path))
    });

    println!();
    println!("{label}");
    for metric in rows.into_iter().take(top) {
        println!(
            "{}\tbytes={}\tchunks={}\tsections={}\twikilinks={}\telapsed_ms={:.3}",
            metric.path,
            metric.bytes,
            metric.chunks,
            metric.sections,
            metric.wikilinks,
            metric.elapsed.as_secs_f64() * 1_000.0
        );
    }
}

fn main() -> Result<(), String> {
    let args = parse_args()?;
    let mut metrics = Vec::new();
    let started = Instant::now();

    if let Some(case_name) = args.synthetic.as_deref() {
        let markdown = synthetic_markdown(case_name)?;
        metrics.push(measure_document(
            format!("synthetic:{case_name}"),
            &markdown,
        ));
    } else if let Some(path) = args.single_file.as_deref() {
        metrics.push(read_and_measure(path, None)?);
    } else {
        let input = args.input.as_deref().ok_or_else(|| usage().to_string())?;
        if input.is_file() {
            metrics.push(read_and_measure(input, None)?);
        } else {
            let root = fs::canonicalize(input)
                .map_err(|e| format!("failed to canonicalize input {}: {e}", input.display()))?;
            let mut files = Vec::new();
            collect_markdown_files(&root, &root, &mut files)?;
            files.sort_by(|left, right| {
                display_path(left, Some(&root)).cmp(&display_path(right, Some(&root)))
            });
            for path in files.into_iter().take(args.limit.unwrap_or(usize::MAX)) {
                metrics.push(read_and_measure(&path, Some(&root))?);
            }
        }
    }

    let mut totals = Totals {
        elapsed: started.elapsed(),
        ..Totals::default()
    };
    for metric in &metrics {
        totals.files += 1;
        totals.bytes += metric.bytes;
        totals.sections += metric.sections;
        totals.chunks += metric.chunks;
        totals.wikilinks += metric.wikilinks;
    }

    println!("profile_extract summary");
    println!("files={}", totals.files);
    println!("bytes={}", totals.bytes);
    println!("sections={}", totals.sections);
    println!("chunks={}", totals.chunks);
    println!("wikilinks={}", totals.wikilinks);
    println!("elapsed_ms={:.3}", totals.elapsed.as_secs_f64() * 1_000.0);
    if totals.files > 0 {
        println!(
            "avg_chunks_per_file={:.3}",
            totals.chunks as f64 / totals.files as f64
        );
    }

    print_top("top by chunks", &metrics, args.top, |metric| {
        metric.chunks as u128
    });
    print_top("top by bytes", &metrics, args.top, |metric| {
        metric.bytes as u128
    });
    print_top("top by elapsed", &metrics, args.top, |metric| {
        metric.elapsed.as_nanos()
    });

    Ok(())
}
