import { invoke } from "@tauri-apps/api/core";

export type ProjectOsManifest = {
  readonly rootName: string;
  readonly files: readonly ProjectOsFileSnippet[];
  readonly skipped: readonly ProjectOsSkippedPath[];
  readonly limits: ProjectOsScanLimits;
};

export type ProjectOsFileSnippet = {
  readonly path: string;
  readonly size: number;
  readonly snippet: string;
};

export type ProjectOsSkippedPath = {
  readonly path: string;
  readonly reason: string;
};

export type ProjectOsScanLimits = {
  readonly maxFiles: number;
  readonly maxBytes: number;
  readonly bytesRead: number;
  readonly truncated: boolean;
};

export type ProjectGitSummaryStatus = "failed" | "notGit" | "notRepoRoot" | "ready";

export type ProjectGitSummary = {
  readonly status: ProjectGitSummaryStatus;
  readonly head: string | null;
  readonly previousCommit: string | null;
  readonly range: string | null;
  readonly changedPaths: readonly string[];
  readonly statusShort: readonly string[];
  readonly diffNameStatus: readonly string[];
  readonly diffStat: readonly string[];
  readonly logOneline: readonly string[];
  readonly message: string | null;
};

export async function chooseProjectOsFolder(): Promise<string | null> {
  return invoke<string | null>("project_os_choose_folder");
}

export async function scanProjectOsFolder(path: string): Promise<ProjectOsManifest> {
  validateProjectRoot(path);
  const manifest = await invoke<ProjectOsManifest>("project_os_scan_folder", { path });
  validateProjectManifest(manifest);
  return manifest;
}

export async function readProjectGitSummary(
  path: string,
  previousCommit: string | null,
): Promise<ProjectGitSummary> {
  validateProjectRoot(path);
  const summary = await invoke<ProjectGitSummary>("project_os_git_summary", { path, previousCommit });
  const normalized = normalizeProjectGitSummary(summary);
  validateProjectGitSummary(normalized);
  return normalized;
}

function validateProjectRoot(path: string): void {
  if (path.trim() === "") {
    throw new Error("Invalid project root: empty path");
  }
  if (path.includes("\0")) {
    throw new Error("Invalid project root: null byte");
  }
  if (!isAbsolutePath(path)) {
    throw new Error(`Invalid project root: must be absolute: ${path}`);
  }
  if (path.split(/[/\\]/).some((segment) => segment === "..")) {
    throw new Error(`Invalid project root: traversal segment: ${path}`);
  }
}

function validateProjectManifest(manifest: ProjectOsManifest): void {
  for (const file of manifest.files) {
    validateManifestPath(file.path);
  }
  for (const skipped of manifest.skipped) {
    validateManifestPath(skipped.path);
  }
}

function validateProjectGitSummary(summary: ProjectGitSummary): void {
  if (!PROJECT_GIT_SUMMARY_STATUSES.has(summary.status)) {
    throw new Error(`Invalid project git summary status: ${summary.status}`);
  }
  for (const path of summary.changedPaths) {
    validateGitSummaryPath(path);
  }
  for (const line of summary.statusShort) {
    for (const path of pathsFromStatusShortLine(line)) validateGitSummaryPath(path);
  }
  for (const line of summary.diffNameStatus) {
    for (const path of pathsFromNameStatusLine(line)) validateGitSummaryPath(path);
  }
  for (const line of summary.diffStat) {
    const path = pathFromDiffStatLine(line);
    if (path !== null) validateGitSummaryPath(path);
  }
  for (const line of summary.logOneline) {
    validateGitSummaryLogLine(line);
  }
}

function normalizeProjectGitSummary(summary: ProjectGitSummary): ProjectGitSummary {
  if (summary.status === "ready" && summary.head !== null && summary.previousCommit === summary.head) {
    return { ...summary, logOneline: [] };
  }
  return summary;
}

function validateManifestPath(path: string): void {
  if (path === "" || path.includes("\0") || isAbsolutePath(path)) {
    throw new Error(`Invalid project manifest path: ${path}`);
  }
  if (path.split(/[/\\]/).some((segment) => segment === "..")) {
    throw new Error(`Invalid project manifest path: ${path}`);
  }
}

function validateGitSummaryPath(path: string): void {
  if (path === "" || path.includes("\0") || isAbsolutePath(path) || path.includes("->")) {
    throw new Error(`Invalid project git summary path: ${path}`);
  }
  if (path.split(/[/\\]/).some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`Invalid project git summary path: ${path}`);
  }
  if (path.split(/[\\/]/).some(gitSummarySegmentIsSensitive)) {
    throw new Error(`Invalid project git summary path: ${path}`);
  }
}

function validateGitSummaryLogLine(line: string): void {
  if (line.trim() === "" || line.includes("\0") || gitSummaryTextIsSensitive(line)) {
    throw new Error(`Invalid project git summary log line: ${line}`);
  }
}

function pathsFromStatusShortLine(line: string): readonly string[] {
  if (line.length < 4) throw new Error(`Invalid project git summary line: ${line}`);
  const path = line.slice(3).trim();
  const renameParts = path.split(" -> ");
  if (renameParts.length === 2) return renameParts;
  return [path];
}

function pathsFromNameStatusLine(line: string): readonly string[] {
  const [, ...paths] = line.split("\t");
  if (paths.length === 0) throw new Error(`Invalid project git summary line: ${line}`);
  return paths;
}

function pathFromDiffStatLine(line: string): string | null {
  const separatorIndex = line.indexOf(" | ");
  if (separatorIndex === -1) return line.includes("changed") ? null : line.trim();
  return line.slice(0, separatorIndex).trim();
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || path.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(path);
}

function gitSummarySegmentIsSensitive(segment: string): boolean {
  if (SECOND_BRAIN_ROOTS.has(segment) || looksSecret(segment)) return true;
  return segment
    .split(/[\s{}\[\]()=>]+/)
    .filter(Boolean)
    .some((token) => SECOND_BRAIN_ROOTS.has(token) || looksSecret(token));
}

function gitSummaryTextIsSensitive(text: string): boolean {
  return text
    .split(/[\s{}\[\]()=>"'`,;:<>]+/)
    .map((token) => token.replace(/^[.]+|[.]+$/g, ""))
    .filter(Boolean)
    .some((token) => gitSummaryTokenIsSensitive(token));
}

function gitSummaryTokenIsSensitive(token: string): boolean {
  if (token.split(/[\\/]/).some(gitSummarySegmentIsSensitive)) return true;
  if (!/[\\/]/.test(token)) return false;
  return (
    token.includes("\0") ||
    isAbsolutePath(token) ||
    token.includes("->") ||
    token.split(/[\\/]/).some((segment) => segment === "" || segment === "." || segment === "..")
  );
}

function looksSecret(name: string): boolean {
  const lowerName = name.toLowerCase();
  return (
    lowerName === ".env" ||
    lowerName.startsWith(".env.") ||
    lowerName.includes("secret") ||
    lowerName.includes("token") ||
    lowerName.includes("credential") ||
    lowerName.includes("private") ||
    ["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "credentials"].includes(lowerName) ||
    lowerName.endsWith(".pem") ||
    lowerName.endsWith(".key") ||
    lowerName.endsWith(".p12") ||
    lowerName.endsWith(".pfx")
  );
}

const SECOND_BRAIN_ROOTS = new Set([
  ".AgentRuns",
  "Calendar",
  "Inbox",
  "Issues",
  "Knowledge",
  "Organize Inbox",
  "Planning",
  "Projects",
  "Tasks",
]);

const PROJECT_GIT_SUMMARY_STATUSES = new Set<ProjectGitSummaryStatus>([
  "failed",
  "notGit",
  "notRepoRoot",
  "ready",
]);
