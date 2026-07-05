import type { FailedValidationRunInput, FailedValidationRunResult } from "./agent_plan_types";

function planFailedValidationRun(input: FailedValidationRunInput): FailedValidationRunResult {
  const runLogPath = ".AgentRuns/failed-organize-inbox.md";
  const runLogMarkdown = [
    "---",
    "type: run_log",
    "status: failed_validation",
    `source_note: ${input.sourceNote}`,
    `provider: ${input.provider.kind}`,
    "---",
    "",
    "# Organize Inbox failed validation",
    "",
    "## Validation Errors",
    ...input.validationErrors.map((error) => `- ${error}`),
    "",
  ].join("\n");
  return {
    runLogPath,
    runLogMarkdown,
    vaultChanges: [{ kind: "write_failed_run_log", path: runLogPath }],
  };
}

export { planFailedValidationRun };
