const WORK_ITEM_STATUSES = ["backlog", "todo", "doing", "done"] as const;
const PROJECT_STATUSES = ["active", "paused", "done"] as const;
const WORK_PRIORITIES = ["low", "medium", "high"] as const;
const WORK_COLORS = ["slate", "yellow", "green", "blue", "purple", "rose"] as const;
const WORK_PROJECT_MANUAL_SYNC_STATUSES = ["idle", "running", "succeeded", "failed"] as const;
const PROJECT_OS_RUN_STATUSES = ["applied", "failed"] as const;

type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];
type WorkProjectStatus = (typeof PROJECT_STATUSES)[number];
type WorkPriority = (typeof WORK_PRIORITIES)[number];
type WorkColor = (typeof WORK_COLORS)[number];
type WorkProjectManualSyncStatus = (typeof WORK_PROJECT_MANUAL_SYNC_STATUSES)[number];
type ProjectOsRunStatus = (typeof PROJECT_OS_RUN_STATUSES)[number];

interface WorkItemDraft {
  readonly title: string;
  readonly description?: string | null;
  readonly projectId: string | null;
  readonly priority: WorkPriority;
  readonly status?: WorkItemStatus;
  readonly color?: WorkColor;
  readonly scheduleDate?: string | null;
  readonly summary?: string | null;
  readonly userOutcome?: string | null;
  readonly nextAction?: string | null;
  readonly statusReason?: string | null;
  readonly priorityReason?: string | null;
  readonly technicalDetails?: string | null;
  readonly sourceEvidence?: readonly string[];
}

interface WorkProjectDraft {
  readonly name: string;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
}

interface WorkProjectLinkedFolderDraft {
  readonly path: string;
  readonly name?: string | null;
  readonly linkedAt?: string | null;
}

interface WorkProjectLinkedFolder {
  readonly path: string;
  readonly name: string;
  readonly linkedAt: string;
}

interface WorkProjectManualSyncState {
  readonly status: WorkProjectManualSyncStatus;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly error: string;
}

interface ProjectOsRunReceipt {
  readonly runId: string;
  readonly status: ProjectOsRunStatus;
  readonly summary: string;
  readonly createdIssueIds: readonly string[];
  readonly updatedIssueIds: readonly string[];
  readonly finishedAt: string;
}

interface ProjectOsIssueDraft {
  readonly title: string;
  readonly summary?: string | null;
  readonly userOutcome?: string | null;
  readonly nextAction?: string | null;
  readonly status?: WorkItemStatus;
  readonly statusReason?: string | null;
  readonly priority: WorkPriority;
  readonly priorityReason?: string | null;
  readonly technicalDetails?: string | null;
  readonly sourceEvidence?: readonly string[];
}

interface ProjectOsIssueUpdate {
  readonly title?: string | null;
  readonly summary?: string | null;
  readonly userOutcome?: string | null;
  readonly nextAction?: string | null;
  readonly status?: WorkItemStatus;
  readonly statusReason?: string | null;
  readonly priority?: WorkPriority;
  readonly priorityReason?: string | null;
  readonly technicalDetails?: string | null;
  readonly sourceEvidence?: readonly string[];
}

interface WorkItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly projectId: string | null;
  readonly status: WorkItemStatus;
  readonly priority: WorkPriority;
  readonly color: WorkColor;
  readonly scheduleDate: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly summary: string;
  readonly userOutcome: string;
  readonly nextAction: string;
  readonly statusReason: string;
  readonly priorityReason: string;
  readonly technicalDetails: string;
  readonly sourceEvidence: readonly string[];
}

interface WorkProject {
  readonly id: string;
  readonly name: string;
  readonly status: WorkProjectStatus;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly createdAt: string;
  readonly linkedFolder: WorkProjectLinkedFolder | null;
  readonly manualSync: WorkProjectManualSyncState;
  readonly autoSyncEnabled: boolean;
  readonly lastProjectOsRunReceipt: ProjectOsRunReceipt | null;
}

interface WorkProjectDateRange {
  readonly startDate: string | null;
  readonly endDate: string | null;
}

interface WorkIdeaDraft {
  readonly text: string;
  readonly color?: WorkColor;
  readonly x?: number;
  readonly y?: number;
}

interface WorkIdea {
  readonly id: string;
  readonly text: string;
  readonly color: WorkColor;
  readonly x: number;
  readonly y: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface WorkOsState {
  readonly tasks: readonly WorkItem[];
  readonly issues: readonly WorkItem[];
  readonly projects: readonly WorkProject[];
  readonly ideas: readonly WorkIdea[];
}

export {
  PROJECT_OS_RUN_STATUSES,
  PROJECT_STATUSES,
  WORK_COLORS,
  WORK_ITEM_STATUSES,
  WORK_PRIORITIES,
  WORK_PROJECT_MANUAL_SYNC_STATUSES,
};
export type {
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
};
