// @allow SIZE_OK - legacy Work OS store owns persisted dashboard state; this change only adds Project OS Git receipt fields.
import { createStore } from "solid-js/store";

import {
  PROJECT_OS_GIT_RECEIPT_STATUSES,
  PROJECT_OS_RUN_STATUSES,
  PROJECT_STATUSES,
  WORK_COLORS,
  WORK_ITEM_STATUSES,
  WORK_PRIORITIES,
  WORK_PROJECT_MANUAL_SYNC_STATUSES,
} from "./work_os_model";
import type {
  ProjectOsGitReceipt,
  ProjectOsGitReceiptStatus,
  ProjectOsIssueDraft,
  ProjectOsIssueUpdate,
  ProjectOsRunReceipt,
  ProjectOsRunStatus,
  WorkColor,
  WorkIdea,
  WorkIdeaDraft,
  WorkItem,
  WorkItemDraft,
  WorkItemStatus,
  WorkOsState,
  WorkPriority,
  WorkProject,
  WorkProjectDateRange,
  WorkProjectDraft,
  WorkProjectLinkedFolder,
  WorkProjectLinkedFolderDraft,
  WorkProjectManualSyncState,
  WorkProjectManualSyncStatus,
  WorkProjectStatus,
} from "./work_os_model";

const WORK_OS_STORAGE_KEY = "momo-work-os-v1";

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

const EMPTY_WORK_OS_STATE: WorkOsState = {
  tasks: [],
  issues: [],
  projects: [],
  ideas: [],
};

const [workOsState, setWorkOsState] = createStore<WorkOsState>(loadWorkOsSnapshot());

function initWorkOsStore(): void {
  setWorkOsState(loadWorkOsSnapshot());
}

function createWorkProject(draft: WorkProjectDraft): WorkProject {
  const now = new Date().toISOString();
  const range = normalizeProjectDateRange(draft.startDate, draft.endDate);
  const project: WorkProject = {
    id: createId("project"),
    name: normalizeTitle(draft.name) || "Untitled project",
    status: "active",
    startDate: range.startDate,
    endDate: range.endDate,
    createdAt: now,
    linkedFolder: null,
    manualSync: emptyManualSyncState(),
    autoSyncEnabled: false,
    lastProjectOsRunReceipt: null,
  };
  setWorkOsState("projects", (projects) => [project, ...projects]);
  persistWorkOsState();
  return project;
}

function createWorkTask(draft: WorkItemDraft): WorkItem {
  const task = createWorkItem(draft);
  setWorkOsState("tasks", (tasks) => [task, ...tasks]);
  persistWorkOsState();
  return task;
}

function createWorkIssue(draft: WorkItemDraft): WorkItem {
  const issue = createWorkItem(draft);
  setWorkOsState("issues", (issues) => [issue, ...issues]);
  persistWorkOsState();
  return issue;
}

function createProjectOsIssue(projectId: string, draft: ProjectOsIssueDraft): WorkItem | null {
  if (!projectExists(projectId)) return null;
  const issue = createWorkItem({ ...draft, projectId });
  setWorkOsState("issues", (issues) => [issue, ...issues]);
  persistWorkOsState();
  return issue;
}

function createWorkIdea(input: string | WorkIdeaDraft): WorkIdea {
  const draft = normalizeIdeaDraft(input);
  const now = new Date().toISOString();
  const idea: WorkIdea = {
    id: createId("idea"),
    text: normalizeText(draft.text) || "Untitled idea",
    color: normalizeWorkColor(draft.color, "yellow"),
    x: normalizeCoordinate(draft.x, 12),
    y: normalizeCoordinate(draft.y, 12),
    createdAt: now,
    updatedAt: now,
  };
  setWorkOsState("ideas", (ideas) => [idea, ...ideas]);
  persistWorkOsState();
  return idea;
}

function updateWorkTaskTitle(id: string, title: string): void {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) return;
  setWorkOsState("tasks", (task) => task.id === id, (task) => ({
    ...task,
    title: normalizedTitle,
    updatedAt: new Date().toISOString(),
  }));
  persistWorkOsState();
}

function updateWorkTaskDescription(id: string, description: string): void {
  setWorkOsState("tasks", (task) => task.id === id, (task) => ({
    ...task,
    description: normalizeText(description),
    updatedAt: new Date().toISOString(),
  }));
  persistWorkOsState();
}

function updateWorkTaskStatus(id: string, status: WorkItemStatus): void {
  setWorkOsState("tasks", (task) => task.id === id, (task) => ({
    ...task,
    status,
    updatedAt: new Date().toISOString(),
  }));
  persistWorkOsState();
}

function updateWorkIssueStatus(id: string, status: WorkItemStatus): void {
  setWorkOsState("issues", (issue) => issue.id === id, (issue) => ({
    ...issue,
    status,
    updatedAt: new Date().toISOString(),
  }));
  persistWorkOsState();
}

function updateWorkTaskPriority(id: string, priority: WorkPriority): void {
  setWorkOsState("tasks", (task) => task.id === id, (task) => ({
    ...task,
    priority,
    updatedAt: new Date().toISOString(),
  }));
  persistWorkOsState();
}

function updateWorkTaskScheduleDate(id: string, scheduleDate: string | null): void {
  const normalizedDate = normalizeDate(scheduleDate);
  setWorkOsState("tasks", (task) => task.id === id, (task) => ({
    ...task,
    scheduleDate: normalizedDate,
    updatedAt: new Date().toISOString(),
  }));
  persistWorkOsState();
}

function updateWorkTaskColor(id: string, color: WorkColor): void {
  setWorkOsState("tasks", (task) => task.id === id, (task) => ({
    ...task,
    color,
    updatedAt: new Date().toISOString(),
  }));
  persistWorkOsState();
}

function updateWorkIssuePriority(id: string, priority: WorkPriority): void {
  setWorkOsState("issues", (issue) => issue.id === id, (issue) => ({
    ...issue,
    priority,
    updatedAt: new Date().toISOString(),
  }));
  persistWorkOsState();
}

function updateProjectOsIssue(projectId: string, issueId: string, update: ProjectOsIssueUpdate): void {
  setWorkOsState(
    "issues",
    (issue) => issue.id === issueId && issue.projectId === projectId,
    (issue) => updateProjectOsIssueFields(issue, update),
  );
  persistWorkOsState();
}

function updateWorkIdeaText(id: string, text: string): void {
  const normalizedText = normalizeText(text) || "Untitled idea";
  setWorkOsState("ideas", (idea) => idea.id === id, (idea) => ({
    ...idea,
    text: normalizedText,
    updatedAt: new Date().toISOString(),
  }));
  persistWorkOsState();
}

function updateWorkIdeaColor(id: string, color: WorkColor): void {
  setWorkOsState("ideas", (idea) => idea.id === id, (idea) => ({
    ...idea,
    color,
    updatedAt: new Date().toISOString(),
  }));
  persistWorkOsState();
}

function updateWorkIdeaPosition(id: string, x: number, y: number): void {
  setWorkOsState("ideas", (idea) => idea.id === id, (idea) => ({
    ...idea,
    x: normalizeCoordinate(x, idea.x),
    y: normalizeCoordinate(y, idea.y),
    updatedAt: new Date().toISOString(),
  }));
  persistWorkOsState();
}

function updateWorkProjectStatus(id: string, status: WorkProjectStatus): void {
  setWorkOsState("projects", (project) => project.id === id, "status", status);
  persistWorkOsState();
}

function updateWorkProjectDates(id: string, startDate: string | null, endDate: string | null): void {
  const range = normalizeProjectDateRange(startDate, endDate);
  setWorkOsState("projects", (project) => project.id === id, "startDate", range.startDate);
  setWorkOsState("projects", (project) => project.id === id, "endDate", range.endDate);
  persistWorkOsState();
}

function linkWorkProjectFolder(id: string, folder: WorkProjectLinkedFolderDraft): void {
  const linkedFolder = normalizeWorkProjectLinkedFolder(folder);
  if (!linkedFolder) return;
  setWorkOsState("projects", (project) => project.id === id, "linkedFolder", linkedFolder);
  persistWorkOsState();
}

function updateWorkProjectManualSync(id: string, manualSync: WorkProjectManualSyncState): void {
  setWorkOsState(
    "projects",
    (project) => project.id === id,
    "manualSync",
    normalizeWorkProjectManualSync(manualSync),
  );
  persistWorkOsState();
}

function toggleWorkProjectAutoSync(id: string, enabled: boolean): void {
  setWorkOsState("projects", (project) => project.id === id, "autoSyncEnabled", enabled);
  persistWorkOsState();
}

function recordProjectOsRunReceipt(id: string, receipt: ProjectOsRunReceipt): void {
  const normalizedReceipt = normalizeProjectOsRunReceipt(receipt);
  if (!normalizedReceipt) return;
  setWorkOsState(
    "projects",
    (project) => project.id === id,
    "lastProjectOsRunReceipt",
    normalizedReceipt,
  );
  persistWorkOsState();
}

function deleteWorkTask(id: string): void {
  setWorkOsState("tasks", (tasks) => tasks.filter((task) => task.id !== id));
  persistWorkOsState();
}

function deleteWorkProject(id: string): void {
  setWorkOsState("projects", (projects) => projects.filter((project) => project.id !== id));
  setWorkOsState("tasks", (tasks) =>
    tasks.map((task) => (task.projectId === id ? { ...task, projectId: null } : task)),
  );
  setWorkOsState("issues", (issues) => issues.filter((issue) => issue.projectId !== id));
  persistWorkOsState();
}

function deleteWorkIdea(id: string): void {
  setWorkOsState("ideas", (ideas) => ideas.filter((idea) => idea.id !== id));
  persistWorkOsState();
}

function resetWorkOsState(): void {
  setWorkOsState(EMPTY_WORK_OS_STATE);
  persistWorkOsState();
}

function createWorkItem(draft: WorkItemDraft): WorkItem {
  const now = new Date().toISOString();
  return {
    id: createId("work"),
    title: normalizeTitle(draft.title) || "Untitled work item",
    description: normalizeText(draft.description),
    projectId: draft.projectId,
    status: draft.status ?? "todo",
    priority: draft.priority,
    color: normalizeWorkColor(draft.color, "slate"),
    scheduleDate: normalizeDate(draft.scheduleDate),
    createdAt: now,
    updatedAt: now,
    summary: normalizeText(draft.summary),
    userOutcome: normalizeText(draft.userOutcome),
    nextAction: normalizeText(draft.nextAction),
    statusReason: normalizeText(draft.statusReason),
    priorityReason: normalizeText(draft.priorityReason),
    technicalDetails: normalizeText(draft.technicalDetails),
    sourceEvidence: normalizeStringList(draft.sourceEvidence),
  };
}

function persistWorkOsState(): void {
  getStorage()?.setItem(WORK_OS_STORAGE_KEY, serializeWorkOsState(workOsState));
}

function loadWorkOsSnapshot(): WorkOsState {
  const storage = getStorage();
  const raw = storage?.getItem(WORK_OS_STORAGE_KEY);
  if (!raw) return EMPTY_WORK_OS_STATE;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return EMPTY_WORK_OS_STATE;
    const snapshot = normalizeWorkOsSnapshot(parsed);
    const serialized = serializeWorkOsState(snapshot);
    if (serialized !== raw) storage?.setItem(WORK_OS_STORAGE_KEY, serialized);
    return snapshot;
  } catch {
    return EMPTY_WORK_OS_STATE;
  }
}

function serializeWorkOsState(snapshot: WorkOsState): string {
  return JSON.stringify({
    tasks: snapshot.tasks,
    issues: snapshot.issues,
    projects: snapshot.projects,
    ideas: snapshot.ideas,
  });
}

function normalizeWorkOsSnapshot(parsed: Record<string, unknown>): WorkOsState {
  const projects = normalizeList(parsed.projects, normalizeWorkProject);
  const projectIds = new Set(projects.map((project) => project.id));
  return {
    tasks: normalizeList(parsed.tasks, normalizeWorkItem),
    issues: normalizeList(parsed.issues, normalizeWorkItem).filter((issue) =>
      shouldKeepRestoredIssue(issue, projectIds),
    ),
    projects,
    ideas: normalizeList(parsed.ideas, normalizeWorkIdea),
  };
}

function shouldKeepRestoredIssue(issue: WorkItem, projectIds: ReadonlySet<string>): boolean {
  return issue.projectId !== null && projectIds.has(issue.projectId);
}

function normalizeList<T>(value: unknown, normalize: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const normalized = normalize(item);
    return normalized ? [normalized] : [];
  });
}

function normalizeWorkItem(value: unknown): WorkItem | null {
  if (!isRecord(value)) return null;
  const id = normalizeTitle(value.id);
  const title = normalizeTitle(value.title);
  if (!id || !title) return null;

  return {
    id,
    title,
    description: normalizeText(value.description),
    projectId: normalizeNullableTitle(value.projectId),
    status: isWorkItemStatus(value.status) ? value.status : "todo",
    priority: isWorkPriority(value.priority) ? value.priority : "medium",
    color: normalizeWorkColor(value.color, "slate"),
    scheduleDate: normalizeDate(value.scheduleDate),
    createdAt: normalizeTitle(value.createdAt) || new Date().toISOString(),
    updatedAt:
      normalizeTitle(value.updatedAt) ||
      normalizeTitle(value.createdAt) ||
      new Date().toISOString(),
    summary: normalizeText(value.summary),
    userOutcome: normalizeText(value.userOutcome),
    nextAction: normalizeText(value.nextAction),
    statusReason: normalizeText(value.statusReason),
    priorityReason: normalizeText(value.priorityReason),
    technicalDetails: normalizeText(value.technicalDetails),
    sourceEvidence: normalizeStringList(value.sourceEvidence),
  };
}

function normalizeWorkProject(value: unknown): WorkProject | null {
  if (!isRecord(value)) return null;
  const id = normalizeTitle(value.id);
  const name = normalizeTitle(value.name);
  if (!id || !name) return null;
  const legacyDate = normalizeDate(value.scheduleDate);
  const range = normalizeProjectDateRange(
    normalizeDate(value.startDate) ?? legacyDate,
    normalizeDate(value.endDate) ?? legacyDate,
  );

  return {
    id,
    name,
    status: isWorkProjectStatus(value.status) ? value.status : "active",
    startDate: range.startDate,
    endDate: range.endDate,
    createdAt: normalizeTitle(value.createdAt) || new Date().toISOString(),
    linkedFolder: normalizeWorkProjectLinkedFolder(value.linkedFolder),
    manualSync: normalizeWorkProjectManualSync(value.manualSync),
    autoSyncEnabled: value.autoSyncEnabled === true,
    lastProjectOsRunReceipt: normalizeProjectOsRunReceipt(value.lastProjectOsRunReceipt),
  };
}

function normalizeWorkIdea(value: unknown): WorkIdea | null {
  if (!isRecord(value)) return null;
  const id = normalizeTitle(value.id);
  const text = normalizeTitle(value.text);
  if (!id || !text) return null;

  return {
    id,
    text,
    color: normalizeWorkColor(value.color, "yellow"),
    x: normalizeCoordinate(value.x, 12),
    y: normalizeCoordinate(value.y, 12),
    createdAt: normalizeTitle(value.createdAt) || new Date().toISOString(),
    updatedAt:
      normalizeTitle(value.updatedAt) ||
      normalizeTitle(value.createdAt) ||
      new Date().toISOString(),
  };
}

function normalizeTitle(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const text = normalizeText(item);
    return text ? [text] : [];
  });
}

function updateProjectOsIssueFields(issue: WorkItem, update: ProjectOsIssueUpdate): WorkItem {
  return {
    ...issue,
    title:
      update.title === undefined ? issue.title : normalizeTitle(update.title) || issue.title,
    summary: update.summary === undefined ? issue.summary : normalizeText(update.summary),
    userOutcome:
      update.userOutcome === undefined ? issue.userOutcome : normalizeText(update.userOutcome),
    nextAction:
      update.nextAction === undefined ? issue.nextAction : normalizeText(update.nextAction),
    status: update.status ?? issue.status,
    statusReason:
      update.statusReason === undefined ? issue.statusReason : normalizeText(update.statusReason),
    priority: update.priority ?? issue.priority,
    priorityReason:
      update.priorityReason === undefined
        ? issue.priorityReason
        : normalizeText(update.priorityReason),
    technicalDetails:
      update.technicalDetails === undefined
        ? issue.technicalDetails
        : normalizeText(update.technicalDetails),
    sourceEvidence:
      update.sourceEvidence === undefined
        ? issue.sourceEvidence
        : normalizeStringList(update.sourceEvidence),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeWorkProjectLinkedFolder(value: unknown): WorkProjectLinkedFolder | null {
  if (!isRecord(value)) return null;
  const path = normalizeTitle(value.path);
  if (!path) return null;
  const pathParts = path.split(/[\\/]/).filter(Boolean);
  return {
    path,
    name: normalizeTitle(value.name) || pathParts[pathParts.length - 1] || path,
    linkedAt: normalizeTitle(value.linkedAt) || new Date().toISOString(),
  };
}

function normalizeWorkProjectManualSync(value: unknown): WorkProjectManualSyncState {
  if (!isRecord(value)) return emptyManualSyncState();
  return {
    status: isWorkProjectManualSyncStatus(value.status) ? value.status : "idle",
    startedAt: normalizeNullableTitle(value.startedAt),
    finishedAt: normalizeNullableTitle(value.finishedAt),
    error: normalizeText(value.error),
  };
}

function normalizeProjectOsRunReceipt(value: unknown): ProjectOsRunReceipt | null {
  if (!isRecord(value)) return null;
  const runId = normalizeTitle(value.runId);
  const finishedAt = normalizeTitle(value.finishedAt);
  if (!runId || !finishedAt) return null;
  return {
    runId,
    status: isProjectOsRunStatus(value.status) ? value.status : "applied",
    summary: normalizeText(value.summary),
    createdIssueIds: normalizeStringList(value.createdIssueIds),
    updatedIssueIds: normalizeStringList(value.updatedIssueIds),
    finishedAt,
    git: normalizeProjectOsGitReceipt(value.git),
  };
}

function normalizeProjectOsGitReceipt(value: unknown): ProjectOsGitReceipt | null {
  if (!isRecord(value) || !isProjectOsGitReceiptStatus(value.status)) return null;
  const changedPaths = normalizeStringList(value.changedPaths).filter(isSafeProjectOsReceiptPath);
  const rejectedPathCount = normalizeStringList(value.changedPaths).length - changedPaths.length;
  const normalizedError = normalizeText(value.error);
  return {
    status: value.status,
    headCommit: normalizeText(value.headCommit),
    previousCommit: normalizeText(value.previousCommit),
    range: normalizeText(value.range),
    summary: normalizeText(value.summary),
    changedPaths,
    error:
      rejectedPathCount === 0
        ? normalizedError
        : [normalizedError, `${rejectedPathCount} unsafe Git receipt path(s) were ignored.`]
            .filter(Boolean)
            .join(" "),
  };
}

function isSafeProjectOsReceiptPath(path: string): boolean {
  const parts = path.split("/");
  if (
    path.startsWith("/") ||
    path.startsWith("~/") ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.includes("->") ||
    /^[A-Za-z]:[\\/]/.test(path) ||
    parts.some((part) => part === "" || part === "." || part === "..") ||
    parts.some(hasSensitiveProjectOsReceiptSegment)
  ) {
    return false;
  }
  return !parts.some((part) => SECOND_BRAIN_ROOTS.has(part));
}

function hasSensitiveProjectOsReceiptSegment(segment: string): boolean {
  const lower = segment.toLowerCase();
  if (looksSecretProjectOsReceiptToken(lower)) return true;
  return lower
    .split(/[\s{}\[\]()=>]+/)
    .filter(Boolean)
    .some(looksSecretProjectOsReceiptToken);
}

function looksSecretProjectOsReceiptToken(token: string): boolean {
  return (
    token === ".env" ||
    token.startsWith(".env.") ||
    token.includes("secret") ||
    token.includes("token") ||
    token.includes("credential") ||
    token.includes("private") ||
    token === "id_rsa" ||
    token === "id_dsa" ||
    token === "id_ecdsa" ||
    token === "id_ed25519" ||
    token === "credentials" ||
    token.endsWith(".pem") ||
    token.endsWith(".key") ||
    token.endsWith(".p12") ||
    token.endsWith(".pfx")
  );
}

function emptyManualSyncState(): WorkProjectManualSyncState {
  return {
    status: "idle",
    startedAt: null,
    finishedAt: null,
    error: "",
  };
}

function normalizeDate(value: unknown): string | null {
  const date = normalizeTitle(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizeProjectDateRange(startValue: unknown, endValue: unknown): WorkProjectDateRange {
  const startDate = normalizeDate(startValue);
  const endDate = normalizeDate(endValue);
  const firstDate = startDate ?? endDate;
  const lastDate = endDate ?? startDate;
  if (firstDate && lastDate && lastDate < firstDate) {
    return { startDate: firstDate, endDate: firstDate };
  }
  return { startDate: firstDate, endDate: lastDate };
}

function normalizeNullableTitle(value: unknown): string | null {
  const title = normalizeTitle(value);
  return title || null;
}

function isWorkItemStatus(value: unknown): value is WorkItemStatus {
  return WORK_ITEM_STATUSES.some((status) => status === value);
}

function isWorkProjectStatus(value: unknown): value is WorkProjectStatus {
  return PROJECT_STATUSES.some((status) => status === value);
}

function isWorkPriority(value: unknown): value is WorkPriority {
  return WORK_PRIORITIES.some((priority) => priority === value);
}

function isWorkColor(value: unknown): value is WorkColor {
  return WORK_COLORS.some((color) => color === value);
}

function isWorkProjectManualSyncStatus(value: unknown): value is WorkProjectManualSyncStatus {
  return WORK_PROJECT_MANUAL_SYNC_STATUSES.some((status) => status === value);
}

function isProjectOsRunStatus(value: unknown): value is ProjectOsRunStatus {
  return PROJECT_OS_RUN_STATUSES.some((status) => status === value);
}

function isProjectOsGitReceiptStatus(value: unknown): value is ProjectOsGitReceiptStatus {
  return PROJECT_OS_GIT_RECEIPT_STATUSES.some((status) => status === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWorkColor(value: unknown, fallback: WorkColor): WorkColor {
  return isWorkColor(value) ? value : fallback;
}

function normalizeIdeaDraft(input: string | WorkIdeaDraft): WorkIdeaDraft {
  if (typeof input === "string") return { text: input };
  return input;
}

function normalizeCoordinate(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(94, Math.max(0, Math.round(value)));
}

function projectExists(id: string): boolean {
  return workOsState.projects.some((project) => project.id === id);
}

function getStorage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function createId(prefix: string): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  return `${prefix}-${randomUuid ? randomUuid.call(globalThis.crypto) : `${Date.now()}`}`;
}

export {
  PROJECT_OS_GIT_RECEIPT_STATUSES,
  PROJECT_OS_RUN_STATUSES,
  PROJECT_STATUSES,
  WORK_COLORS,
  WORK_ITEM_STATUSES,
  WORK_PRIORITIES,
  WORK_PROJECT_MANUAL_SYNC_STATUSES,
  createProjectOsIssue,
  createWorkIdea,
  createWorkIssue,
  createWorkProject,
  createWorkTask,
  deleteWorkProject,
  deleteWorkTask,
  deleteWorkIdea,
  initWorkOsStore,
  linkWorkProjectFolder,
  recordProjectOsRunReceipt,
  resetWorkOsState,
  toggleWorkProjectAutoSync,
  updateProjectOsIssue,
  updateWorkIdeaColor,
  updateWorkIdeaPosition,
  updateWorkIdeaText,
  updateWorkIssuePriority,
  updateWorkIssueStatus,
  updateWorkProjectDates,
  updateWorkProjectManualSync,
  updateWorkProjectStatus,
  updateWorkTaskColor,
  updateWorkTaskDescription,
  updateWorkTaskPriority,
  updateWorkTaskScheduleDate,
  updateWorkTaskStatus,
  updateWorkTaskTitle,
  workOsState,
};
export type {
  ProjectOsGitReceipt,
  ProjectOsGitReceiptStatus,
  ProjectOsIssueDraft,
  ProjectOsIssueUpdate,
  ProjectOsRunReceipt,
  ProjectOsRunStatus,
  WorkColor,
  WorkIdea,
  WorkItem,
  WorkItemStatus,
  WorkPriority,
  WorkProject,
  WorkProjectLinkedFolder,
  WorkProjectLinkedFolderDraft,
  WorkProjectManualSyncState,
  WorkProjectManualSyncStatus,
  WorkProjectStatus,
};
