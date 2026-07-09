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

export type ProjectGitSummaryRequest = {
  readonly previousCommit?: string | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
};

export type ProjectGitFileStat = {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
};

export type ProjectGitCommitSummary = {
  readonly shortHash: string;
  readonly subject: string;
  readonly author: string;
  readonly authorDate: string;
  readonly changedPaths: readonly string[];
  readonly diffStat: readonly ProjectGitFileStat[];
};

export type ProjectGitDateSummary = {
  readonly date: string;
  readonly commits: readonly ProjectGitCommitSummary[];
};

export type ProjectGitWorkingTreeSummary = {
  readonly stagedPaths: readonly string[];
  readonly unstagedPaths: readonly string[];
  readonly untrackedPaths: readonly string[];
};

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
  readonly commitsByDate: readonly ProjectGitDateSummary[];
  readonly workingTree: ProjectGitWorkingTreeSummary;
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
  request: ProjectGitSummaryRequest = {},
): Promise<ProjectGitSummary> {
  validateProjectRoot(path);
  const normalizedRequest = normalizeProjectGitSummaryRequest(request);
  const summary = await invoke<ProjectGitSummary>("project_os_git_summary", {
    path,
    previousCommit: normalizedRequest.previousCommit,
    startDate: normalizedRequest.startDate,
    endDate: normalizedRequest.endDate,
  });
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
  for (const dateSummary of summary.commitsByDate) {
    validateGitSummaryDate(dateSummary.date);
    for (const commit of dateSummary.commits) {
      validateGitSummaryCommit(commit);
    }
  }
  for (const path of summary.workingTree.stagedPaths) validateGitSummaryPath(path);
  for (const path of summary.workingTree.unstagedPaths) validateGitSummaryPath(path);
  for (const path of summary.workingTree.untrackedPaths) validateGitSummaryPath(path);
}

function normalizeProjectGitSummary(summary: ProjectGitSummary): ProjectGitSummary {
  const normalized: ProjectGitSummary = {
    ...summary,
    commitsByDate: summary.commitsByDate ?? [],
    workingTree: summary.workingTree ?? emptyWorkingTreeSummary(),
  };
  if (
    normalized.status === "ready" &&
    normalized.head !== null &&
    normalized.previousCommit === normalized.head
  ) {
    return { ...normalized, logOneline: [] };
  }
  return normalized;
}

function normalizeProjectGitSummaryRequest(request: ProjectGitSummaryRequest): {
  readonly previousCommit: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
} {
  return {
    previousCommit: request.previousCommit ?? null,
    startDate: request.startDate ?? null,
    endDate: request.endDate ?? null,
  };
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

function validateGitSummaryCommit(commit: ProjectGitCommitSummary): void {
  if (!/^[0-9a-f]{7,64}$/i.test(commit.shortHash)) {
    throw new Error(`Invalid project git summary commit hash: ${commit.shortHash}`);
  }
  validateGitSummaryText(commit.subject, "commit subject");
  validateGitSummaryText(commit.author, "commit author");
  validateGitSummaryText(commit.authorDate, "commit author date");
  for (const path of commit.changedPaths) validateGitSummaryPath(path);
  for (const stat of commit.diffStat) {
    validateGitSummaryPath(stat.path);
    validateGitSummaryCount(stat.additions, stat.path);
    validateGitSummaryCount(stat.deletions, stat.path);
  }
}

function validateGitSummaryText(text: string, label: string): void {
  if (text.trim() === "" || text.includes("\0") || gitSummaryTextIsSensitive(text)) {
    throw new Error(`Invalid project git summary ${label}: ${text}`);
  }
}

function validateGitSummaryDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid project git summary date: ${date}`);
  }
}

function validateGitSummaryCount(value: number, path: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid project git summary diff stat count for: ${path}`);
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

function emptyWorkingTreeSummary(): ProjectGitWorkingTreeSummary {
  return { stagedPaths: [], unstagedPaths: [], untrackedPaths: [] };
}
