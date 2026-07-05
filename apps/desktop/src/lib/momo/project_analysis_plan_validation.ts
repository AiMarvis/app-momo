import type {
  ProjectAnalysisPlanValidationResult,
  ProjectIssueCreate,
  ProjectIssueUpdate,
} from "./project_analysis_plan";
import {
  isNonActionable,
  isRecord,
  optionalUserText,
  priorityFor,
  projectIdFor,
  pushError,
  requiredArray,
  requiredString,
  sourceEvidenceArray,
  statusFor,
  userText,
  validateTitle,
  type ValidationContext,
} from "./project_analysis_plan_validation_helpers";

function validateProjectAnalysisPlan(
  value: unknown,
  expectedProjectId: string,
): ProjectAnalysisPlanValidationResult {
  if (!isRecord(value)) return invalid("ProjectAnalysisPlan must be a JSON object");

  const context: ValidationContext = { expectedProjectId, errors: [] };
  const kind = requiredString(value.kind, "plan.kind", context);
  const projectId = requiredString(value.projectId, "plan.projectId", context);
  const summary = requiredString(value.summary, "plan.summary", context);
  const createsInput = requiredArray(value.creates, "plan.creates", context);
  const updatesInput = requiredArray(value.updates, "plan.updates", context);

  if (kind !== null && kind !== "project_analysis") context.errors.push("plan.kind must be project_analysis");
  if (projectId !== null && projectId !== expectedProjectId)
    context.errors.push("plan.projectId must match requested projectId");

  const creates = createsInput.flatMap((item, index) => parseIssueCreate(item, index, context));
  const updates = updatesInput.flatMap((item, index) => parseIssueUpdate(item, index, context));
  if (
    context.errors.length > 0 ||
    kind !== "project_analysis" ||
    projectId === null ||
    summary === null
  ) {
    return { kind: "invalid", errors: context.errors };
  }
  return { kind: "valid", plan: { kind: "project_analysis", projectId, summary, creates, updates } };
}

function parseIssueCreate(
  value: unknown,
  index: number,
  context: ValidationContext,
): readonly ProjectIssueCreate[] {
  const label = `creates[${index}]`;
  if (!isRecord(value)) return pushError(context, `${label} must be an object`);

  const kind = requiredString(value.kind, `${label}.kind`, context);
  const projectId = projectIdFor(value.projectId, `${label}.projectId`, context);
  const title = requiredString(value.title, `${label}.title`, context);
  const summary = userText(value.summary, `${label}.summary`, context);
  const userOutcome = userText(value.userOutcome, `${label}.userOutcome`, context);
  const nextAction = userText(value.nextAction, `${label}.nextAction`, context);
  const status = statusFor(value.status, `${label}.status`, context);
  const statusReason = userText(value.statusReason, `${label}.statusReason`, context);
  const priority = priorityFor(value.priority, `${label}.priority`, context);
  const priorityReason = userText(value.priorityReason, `${label}.priorityReason`, context);
  const sourceEvidence = sourceEvidenceArray(value.sourceEvidence, `${label}.sourceEvidence`, context);
  const technicalDetails = requiredString(value.technicalDetails, `${label}.technicalDetails`, context);

  if (kind !== null && kind !== "project_issue") context.errors.push(`${label}.kind must be project_issue`);
  if (title !== null) validateTitle(title, `${label}.title`, context);
  if (nextAction !== null && isNonActionable(nextAction)) {
    context.errors.push(`${label}.nextAction must be a concrete next action`);
  }
  if (
    kind !== "project_issue" ||
    projectId === null ||
    title === null ||
    summary === null ||
    userOutcome === null ||
    nextAction === null ||
    status === null ||
    statusReason === null ||
    priority === null ||
    priorityReason === null ||
    sourceEvidence === null ||
    technicalDetails === null
  ) {
    return [];
  }
  return [
    {
      kind: "project_issue",
      projectId,
      title,
      summary,
      userOutcome,
      nextAction,
      status,
      statusReason,
      priority,
      priorityReason,
      sourceEvidence,
      technicalDetails,
    },
  ];
}

function parseIssueUpdate(
  value: unknown,
  index: number,
  context: ValidationContext,
): readonly ProjectIssueUpdate[] {
  const label = `updates[${index}]`;
  if (!isRecord(value)) return pushError(context, `${label} must be an object`);

  const kind = requiredString(value.kind, `${label}.kind`, context);
  const projectId = projectIdFor(value.projectId, `${label}.projectId`, context);
  const issueId = requiredString(value.issueId, `${label}.issueId`, context);
  const summary = optionalUserText(value.summary, `${label}.summary`, context);
  const userOutcome = optionalUserText(value.userOutcome, `${label}.userOutcome`, context);
  const nextAction = optionalUserText(value.nextAction, `${label}.nextAction`, context);
  const status = value.status === undefined ? undefined : statusFor(value.status, `${label}.status`, context);
  const statusReason = optionalUserText(value.statusReason, `${label}.statusReason`, context);
  const priority =
    value.priority === undefined ? undefined : priorityFor(value.priority, `${label}.priority`, context);
  const priorityReason = optionalUserText(value.priorityReason, `${label}.priorityReason`, context);
  const sourceEvidence =
    value.sourceEvidence === undefined
      ? undefined
      : sourceEvidenceArray(value.sourceEvidence, `${label}.sourceEvidence`, context);
  const technicalDetails =
    value.technicalDetails === undefined
      ? undefined
      : requiredString(value.technicalDetails, `${label}.technicalDetails`, context);

  if (kind !== null && kind !== "project_issue_update")
    context.errors.push(`${label}.kind must be project_issue_update`);
  if (nextAction !== undefined && nextAction !== null && isNonActionable(nextAction)) {
    context.errors.push(`${label}.nextAction must be a concrete next action`);
  }
  if (
    kind !== "project_issue_update" ||
    projectId === null ||
    issueId === null ||
    status === null ||
    priority === null ||
    sourceEvidence === null ||
    technicalDetails === null
  ) {
    return [];
  }
  return [
    {
      kind: "project_issue_update",
      projectId,
      issueId,
      ...(summary === undefined ? {} : { summary }),
      ...(userOutcome === undefined ? {} : { userOutcome }),
      ...(nextAction === undefined ? {} : { nextAction }),
      ...(status === undefined ? {} : { status }),
      ...(statusReason === undefined ? {} : { statusReason }),
      ...(priority === undefined ? {} : { priority }),
      ...(priorityReason === undefined ? {} : { priorityReason }),
      ...(sourceEvidence === undefined ? {} : { sourceEvidence }),
      ...(technicalDetails === undefined ? {} : { technicalDetails }),
    },
  ];
}

function invalid(error: string): ProjectAnalysisPlanValidationResult {
  return { kind: "invalid", errors: [error] };
}

export { validateProjectAnalysisPlan };
