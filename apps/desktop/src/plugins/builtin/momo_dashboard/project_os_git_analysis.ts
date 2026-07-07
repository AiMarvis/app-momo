import {
  readProjectGitSummary,
  type ProjectGitSummary,
} from "~/lib/project_os_fs";

import type { ProjectOsGitReceipt, ProjectOsRunReceipt } from "./work_os_store";

type ProjectGitIssueScenario =
  | "decision_owner"
  | "onboarding_setup"
  | "payment_recovery"
  | "release_readiness"
  | "safe_update";

type ProjectGitIssueSeed = {
  readonly scenario: ProjectGitIssueScenario;
  readonly sourceEvidence: string;
};

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

function previousProjectGitCommit(receipt: ProjectOsRunReceipt | null): string | null {
  const git = receipt?.git;
  if (!git) return null;
  if (git.status === "summarized") return git.headCommit || null;
  return git.previousCommit || null;
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

function projectGitIssueSeeds(gitSummary: ProjectGitSummary): readonly ProjectGitIssueSeed[] {
  if (gitSummary.status !== "ready" || gitSummary.changedPaths.length === 0) return [];
  const haystack = [
    ...gitSummary.changedPaths,
    ...gitSummary.statusShort,
    ...gitSummary.diffNameStatus,
    ...gitSummary.diffStat,
    ...gitSummary.logOneline,
  ]
    .join("\n")
    .toLowerCase();
  const seeds: ProjectGitIssueSeed[] = [];
  if (/\b(release|version|changelog|updater|update|v\d+\.\d+\.\d+|릴리스|버전|업데이트)\b/.test(haystack)) {
    seeds.push({ scenario: "safe_update", sourceEvidence: gitEvidenceForScenario(gitSummary, "safe_update") });
  }
  if (/\b(qa|test|verify|manual|checklist|smoke|검증|체크리스트|확인)\b/.test(haystack)) {
    seeds.push({ scenario: "release_readiness", sourceEvidence: gitEvidenceForScenario(gitSummary, "release_readiness") });
  }
  if (/\b(payment|checkout|billing|purchase|invoice|결제|청구)\b/.test(haystack)) {
    seeds.push({ scenario: "payment_recovery", sourceEvidence: gitEvidenceForScenario(gitSummary, "payment_recovery") });
  }
  if (/\b(onboarding|setup|first[-\s]?run|activation|getting started|온보딩|설정)\b/.test(haystack)) {
    seeds.push({ scenario: "onboarding_setup", sourceEvidence: gitEvidenceForScenario(gitSummary, "onboarding_setup") });
  }
  if (/\b(owner|ownership|approval|approver|decision|책임|승인|결정)\b/.test(haystack)) {
    seeds.push({ scenario: "decision_owner", sourceEvidence: gitEvidenceForScenario(gitSummary, "decision_owner") });
  }
  return seeds;
}

function gitEvidenceForScenario(gitSummary: ProjectGitSummary, scenario: ProjectGitIssueScenario): string {
  const firstPath = gitSummary.changedPaths[0] ?? "project files";
  const scenarioPattern = gitEvidencePatternForScenario(scenario);
  return (
    gitSummary.changedPaths.find((path) => scenarioPattern.test(path)) ??
    gitSummary.diffNameStatus
      .flatMap((line) => extractGitLinePaths(line))
      .find((path) => scenarioPattern.test(path)) ??
    gitSummary.diffStat
      .flatMap((line) => extractGitLinePaths(line))
      .find((path) => scenarioPattern.test(path)) ??
    firstPath
  );
}

function gitEvidencePatternForScenario(scenario: ProjectGitIssueScenario): RegExp {
  switch (scenario) {
    case "payment_recovery":
      return /payment|checkout|billing|purchase|invoice|결제|청구/i;
    case "onboarding_setup":
      return /onboarding|setup|first[-\s]?run|activation|getting-started|온보딩|설정/i;
    case "safe_update":
      return /release|version|changelog|updater|update|v\d+\.\d+\.\d+|릴리스|버전|업데이트/i;
    case "release_readiness":
      return /release|qa|test|verify|manual|checklist|smoke|검증|체크리스트|확인/i;
    case "decision_owner":
      return /owner|ownership|approval|approver|decision|책임|승인|결정/i;
  }
}

function extractGitLinePaths(line: string): readonly string[] {
  return line
    .split(/\t|\s+\|\s+|\s{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.includes("/") && !part.includes("->") && !part.startsWith("+") && !part.startsWith("-"));
}

function gitReceiptSummary(summary: ProjectGitSummary): string {
  const changedCount = summary.changedPaths.length;
  const commitCount = summary.logOneline.length;
  if (changedCount === 0 && commitCount === 0) return "Git was checked; no changed files were found.";
  const fileCopy = `${changedCount} changed ${changedCount === 1 ? "path" : "paths"}`;
  const commitCopy = `${commitCount} recent ${commitCount === 1 ? "commit" : "commits"}`;
  return `Included ${fileCopy} and ${commitCopy} as project evidence.`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Project analysis failed.";
}

export {
  previousProjectGitCommit,
  projectGitIssueSeeds,
  projectGitReceiptFromSummary,
  readProjectGitSummaryForAnalysis,
};
export type { ProjectGitIssueScenario };
