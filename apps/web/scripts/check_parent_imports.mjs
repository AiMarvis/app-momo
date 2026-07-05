import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, "src");
const supportedExtensions = new Set([".astro", ".js", ".mjs", ".ts", ".tsx"]);
const parentImportPattern =
  /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"](\.\.\/[^'"]+)['"]|\bimport\s*\(\s*['"](\.\.\/[^'"]+)['"]\s*\)/g;

async function getSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await getSourceFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && supportedExtensions.has(extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function getLineNumber(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

const files = await getSourceFiles(sourceRoot);
const violations = [];

for (const file of files) {
  const source = await readFile(file, "utf8");

  for (const match of source.matchAll(parentImportPattern)) {
    violations.push({
      file: relative(root, file),
      line: getLineNumber(source, match.index ?? 0),
      specifier: match[1] ?? match[2],
    });
  }
}

if (violations.length > 0) {
  process.stderr.write("Parent-relative imports are not allowed. Use @/ imports instead.\n\n");

  for (const violation of violations) {
    process.stderr.write(`${violation.file}:${violation.line} ${violation.specifier}\n`);
  }

  process.exit(1);
}
