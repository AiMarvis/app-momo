import { readProjectGitSummary, type ProjectGitSummary } from "~/lib/project_os_fs";

import type { ProjectOsGitReceipt } from "./work_os_store";

async function readProjectGitSummaryForAnalysis(
  path: string,
  previousCommit: string | null,
): Promise<ProjectGitSummary> {
  try {
    return await readProjectGitSummary(path, previousCommit);
  } catch (error) {
    const message = errorMessage(error);
    if (/invalid project git summary path|invalid project root/i.test(message)) throw error;
    return {
      status: "failed",
      head: null,
      previousCommit,
      range: null,
      changedPaths: [],
      statusShort: [],
      diffNameStatus: [],
      diffStat: [],
      logOneline: [],
      message,
    };
  }
}

function projectGitReceiptFromSummary(summary: ProjectGitSummary): ProjectOsGitReceipt {
  switch (summary.status) {
    case "ready":
      return {
        status: "summarized",
        headCommit: summary.head ?? "",
        previousCommit: summary.previousCommit ?? "",
        range: summary.range ?? "HEAD",
        summary: gitReceiptSummary(summary),
        changedPaths: summary.changedPaths,
        error: "",
      };
    case "notGit":
    case "notRepoRoot":
      return {
        status: "not_git_repo",
        headCommit: "",
        previousCommit: summary.previousCommit ?? "",
        range: "",
        summary: summary.message ?? "No Git repository was detected for this linked folder.",
        changedPaths: [],
        error: "",
      };
    case "failed":
      return {
        status: "failed",
        headCommit: "",
        previousCommit: summary.previousCommit ?? "",
        range: "",
        summary: "",
        changedPaths: [],
        error: summary.message ?? "Git summary could not be read.",
      };
  }
}

function gitReceiptSummary(summary: ProjectGitSummary): string {
  const changedCount = summary.changedPaths.length;
  const commitCount = summary.logOneline.length;
  if (changedCount === 0 && commitCount === 0)
    return "Git was checked; no changed files were found.";
  const fileCopy = `${changedCount} changed ${changedCount === 1 ? "path" : "paths"}`;
  const commitCopy = `${commitCount} recent ${commitCount === 1 ? "commit" : "commits"}`;
  return `Included ${fileCopy} and ${commitCopy} as project evidence.`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Project analysis failed.";
}

export { projectGitReceiptFromSummary, readProjectGitSummaryForAnalysis };
