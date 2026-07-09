// @allow SIZE_OK - Project OS runner owns provider routing, issue application, and run receipts.
import { invoke } from "@tauri-apps/api/core";

import { resolveLocale } from "~/i18n";
import { scanProjectOsFolder } from "~/lib/project_os_fs";
import {
  buildProjectAnalysisPrompt,
  parseProjectAnalysisPlanJson,
  projectAnalysisPlanLanguageErrors,
} from "~/lib/momo/project_analysis_plan";
import {
  projectAnalysisPlanToOperations,
  type ProjectIssueOperation,
} from "~/lib/momo/project_analysis_runtime";
import { loadPluginSettings } from "~/plugins/settings_store";
import { settingsState } from "~/stores/settings";

import {
  projectGitReceiptFromSummary,
  readProjectGitSummaryForAnalysis,
} from "./project_os_git_analysis";
import {
  createProjectOsIssue,
  recordProjectOsRunReceipt,
  updateProjectOsIssue,
  updateWorkProjectManualSync,
  workOsState,
  type ProjectOsGitReceipt,
  type ProjectOsRunReceipt,
  type WorkItem,
  type WorkProject,
} from "./work_os_store";
import {
  AI_CHAT_SECURE_KEYS,
  AI_CHAT_SETTINGS_PLUGIN_ID,
  agentApiProviderNeedsKey,
  createAgentApiConfigFromAiConfig,
  createCodexConfigFromAiConfig,
  createDefaultAiConfig,
  normalizeAiConfig,
} from "../ai_chat/config";
import type { AiConfig } from "../ai_chat/types";

type ProjectOsAnalysisResult =
  | {
      readonly kind: "applied";
      readonly receipt: ProjectOsRunReceipt;
    }
  | {
      readonly kind: "failed";
      readonly error: string;
      readonly receipt: ProjectOsRunReceipt;
    };

type ProjectOsApplyResult =
  | {
      readonly kind: "applied";
      readonly createdIssueIds: readonly string[];
      readonly updatedIssueIds: readonly string[];
    }
  | {
      readonly kind: "failed";
      readonly error: string;
    };

type ProjectAnalysisAgentResult =
  | {
      readonly kind: "ok";
      readonly content: string;
    }
  | {
      readonly kind: "failed";
      readonly reason: string;
    };

type FinishProjectOsRunInput = {
  readonly projectId: string;
  readonly startedAt: string;
  readonly status: ProjectOsRunReceipt["status"];
  readonly summary: string;
  readonly createdIssueIds: readonly string[];
  readonly updatedIssueIds: readonly string[];
  readonly error: string;
  readonly git: ProjectOsGitReceipt | null;
};

interface CodexReadiness {
  readonly ready: boolean;
}

interface ProjectAnalysisChatResponse {
  readonly content: string;
}

async function runProjectOsAnalysis(project: WorkProject): Promise<ProjectOsAnalysisResult> {
  const startedAt = new Date().toISOString();
  updateWorkProjectManualSync(project.id, {
    status: "running",
    startedAt,
    finishedAt: null,
    error: "",
  });

  if (project.linkedFolder === null) {
    return failProjectOsRun(project.id, startedAt, "Link a project folder before analyzing.");
  }

  try {
    const manifest = await scanProjectOsFolder(project.linkedFolder.path);
    const gitSummary = await readProjectGitSummaryForAnalysis(project.linkedFolder.path, {
      previousCommit: null,
      startDate: project.startDate,
      endDate: project.endDate,
    });
    const gitReceipt = projectGitReceiptFromSummary(gitSummary);
    const generatedAt = new Date().toISOString();
    const existingIssues = existingIssueLines(project.id);
    const issueLanguage = resolveLocale(settingsState.general.projectIssueLanguage);
    const agentPrompt = buildProjectAnalysisPrompt({
      projectId: project.id,
      projectName: project.name,
      issueLanguage,
      manifest,
      gitSummary,
      existingIssues,
      lastRunReceipt: project.lastProjectOsRunReceipt,
      nowIso: generatedAt,
    });
    assertProjectAgentPrompt(agentPrompt, project.id);
    const agentResult = await runProjectAnalysisAgent(agentPrompt);
    if (agentResult.kind === "failed") {
      return failProjectOsRun(project.id, startedAt, agentResult.reason, gitReceipt);
    }

    const validation = parseProjectAnalysisPlanJson(agentResult.content, project.id);
    if (validation.kind === "invalid") {
      return failProjectOsRun(project.id, startedAt, validation.errors.join("; "), gitReceipt);
    }
    const languageErrors = projectAnalysisPlanLanguageErrors(validation.plan, issueLanguage);
    if (languageErrors.length > 0) {
      return failProjectOsRun(project.id, startedAt, languageErrors.join("; "), gitReceipt);
    }

    const runtime = projectAnalysisPlanToOperations(validation.plan, generatedAt);
    const applied = applyProjectOsOperations(project.id, runtime.operations);
    if (applied.kind === "failed")
      return failProjectOsRun(project.id, startedAt, applied.error, gitReceipt);

    const receipt = finishProjectOsRun({
      projectId: project.id,
      startedAt,
      status: "applied",
      summary: runtime.receipt.summary,
      createdIssueIds: applied.createdIssueIds,
      updatedIssueIds: applied.updatedIssueIds,
      error: "",
      git: gitReceipt,
    });
    return { kind: "applied", receipt };
  } catch (error) {
    return failProjectOsRun(project.id, startedAt, errorMessage(error));
  }
}

async function runProjectAnalysisAgent(prompt: string): Promise<ProjectAnalysisAgentResult> {
  try {
    const config = await loadAiProviderSettings();
    if (config.agentApiProvider === "codex_cli") return runCodexProjectAnalysis(prompt, config);
    return runOpenAiCompatibleProjectAnalysis(prompt, config);
  } catch (error) {
    return { kind: "failed", reason: errorMessage(error) };
  }
}

async function runCodexProjectAnalysis(
  prompt: string,
  config: AiConfig,
): Promise<ProjectAnalysisAgentResult> {
  const readiness = await invoke<CodexReadiness>("agent_check_codex_readiness");
  if (!readiness.ready) {
    return { kind: "failed", reason: "Codex CLI is not ready for Project OS analysis." };
  }
  const response = await invoke<ProjectAnalysisChatResponse>("agent_run_codex_chat", {
    request: {
      content: prompt,
      mode: "ask",
      codexConfig: createCodexConfigFromAiConfig(config),
    },
  });
  return chatResponseContent(response);
}

async function runOpenAiCompatibleProjectAnalysis(
  prompt: string,
  config: AiConfig,
): Promise<ProjectAnalysisAgentResult> {
  const apiConfig = createAgentApiConfigFromAiConfig(config);
  if (agentApiProviderNeedsKey(apiConfig.providerId)) {
    const status = await invoke<{ configured: boolean }>("agent_get_agent_api_key_status", {
      apiConfig,
    });
    if (!status.configured) {
      return { kind: "failed", reason: `${apiConfig.providerName} API key is not configured.` };
    }
  }
  const response = await invoke<ProjectAnalysisChatResponse>("agent_run_openai_compatible_chat", {
    request: {
      content: prompt,
      mode: "ask",
      apiConfig,
    },
  });
  return chatResponseContent(response);
}

function chatResponseContent(response: ProjectAnalysisChatResponse): ProjectAnalysisAgentResult {
  const content = response.content.trim();
  return content
    ? { kind: "ok", content }
    : { kind: "failed", reason: "Project analysis provider returned no response." };
}

async function loadAiProviderSettings(): Promise<AiConfig> {
  return loadPluginSettings<AiConfig>({
    pluginId: AI_CHAT_SETTINGS_PLUGIN_ID,
    defaults: createDefaultAiConfig(),
    secureKeys: [...AI_CHAT_SECURE_KEYS],
    normalize: (raw) => normalizeAiConfig(raw),
  });
}

function applyProjectOsOperations(
  projectId: string,
  operations: readonly ProjectIssueOperation[],
): ProjectOsApplyResult {
  if (!workOsState.projects.some((project) => project.id === projectId)) {
    return { kind: "failed", error: "Project is no longer available." };
  }

  const existingIssueIds = new Set(
    workOsState.issues.filter((issue) => issue.projectId === projectId).map((issue) => issue.id),
  );
  for (const operation of operations) {
    const error = operationPreflightError(projectId, operation, existingIssueIds);
    if (error) return { kind: "failed", error };
  }

  const createdIssueIds: string[] = [];
  const updatedIssueIds: string[] = [];
  for (const operation of operations) {
    switch (operation.kind) {
      case "create_project_issue": {
        const created = createProjectOsIssue(projectId, {
          title: operation.issue.title,
          summary: operation.issue.summary,
          userOutcome: operation.issue.userOutcome,
          nextAction: operation.issue.nextAction,
          status: operation.issue.status,
          statusReason: operation.issue.statusReason,
          priority: operation.issue.priority,
          priorityReason: operation.issue.priorityReason,
          technicalDetails: operation.issue.technicalDetails,
          sourceEvidence: operation.issue.sourceEvidence,
        });
        if (created === null) return { kind: "failed", error: "Project is no longer available." };
        createdIssueIds.push(created.id);
        break;
      }
      case "update_project_issue":
        updateProjectOsIssue(projectId, operation.issueId, operation.update);
        updatedIssueIds.push(operation.issueId);
        break;
    }
  }

  return { kind: "applied", createdIssueIds, updatedIssueIds };
}

function operationPreflightError(
  projectId: string,
  operation: ProjectIssueOperation,
  existingIssueIds: ReadonlySet<string>,
): string {
  switch (operation.kind) {
    case "create_project_issue":
      return operation.projectId === projectId && operation.issue.projectId === projectId
        ? ""
        : "Project analysis returned work for another project.";
    case "update_project_issue":
      if (operation.projectId !== projectId || operation.update.projectId !== projectId) {
        return "Project analysis returned work for another project.";
      }
      if (operation.issueId !== operation.update.issueId) {
        return "Project analysis returned a mismatched issue update.";
      }
      return existingIssueIds.has(operation.issueId)
        ? ""
        : "Project analysis tried to update an issue that is not in this project.";
  }
}

function failProjectOsRun(
  projectId: string,
  startedAt: string,
  reason: string,
  git: ProjectOsGitReceipt | null = null,
): Extract<ProjectOsAnalysisResult, { kind: "failed" }> {
  const receipt = finishProjectOsRun({
    projectId,
    startedAt,
    status: "failed",
    summary: `Project analysis stopped before changing issues: ${reason}`,
    createdIssueIds: [],
    updatedIssueIds: [],
    error: reason,
    git,
  });
  return { kind: "failed", error: reason, receipt };
}

function finishProjectOsRun(input: FinishProjectOsRunInput): ProjectOsRunReceipt {
  const finishedAt = new Date().toISOString();
  const receipt: ProjectOsRunReceipt = {
    runId: createProjectOsRunId(),
    status: input.status,
    summary: input.summary,
    createdIssueIds: input.createdIssueIds,
    updatedIssueIds: input.updatedIssueIds,
    finishedAt,
    git: input.git,
  };
  recordProjectOsRunReceipt(input.projectId, receipt);
  updateWorkProjectManualSync(input.projectId, {
    status: input.status === "applied" ? "succeeded" : "failed",
    startedAt: input.startedAt,
    finishedAt,
    error: input.error,
  });
  return receipt;
}

function existingIssueLines(projectId: string): readonly string[] {
  const issues = workOsState.issues.filter((issue) => issue.projectId === projectId);
  if (issues.length === 0) return ["No existing Project OS issues."];
  return issues.map(issueLine);
}

function assertProjectAgentPrompt(prompt: string, projectId: string): void {
  if (!prompt.includes(projectId) || !prompt.includes("gitChangeSummary")) {
    throw new Error("Project analysis prompt is missing required project evidence.");
  }
}

function issueLine(issue: WorkItem): string {
  return [
    `id=${issue.id}`,
    `title=${issue.title}`,
    `outcome=${issue.userOutcome || "none"}`,
    `next=${issue.nextAction || "none"}`,
    `status=${issue.status}`,
    `priority=${issue.priority}`,
    `summary=${issue.summary || "none"}`,
  ].join("; ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Project analysis failed.";
}

function createProjectOsRunId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  return `project-os-${randomUuid ? randomUuid.call(globalThis.crypto) : Date.now()}`;
}

export { applyProjectOsOperations, runProjectOsAnalysis };
export type { ProjectOsAnalysisResult, ProjectOsApplyResult };
