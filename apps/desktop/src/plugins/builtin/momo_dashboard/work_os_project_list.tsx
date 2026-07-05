import { For, Show, createSignal } from "solid-js";

import { FolderIcon, SparklesIcon } from "~/components/icons";
import { chooseProjectOsFolder } from "~/lib/project_os_fs";

import { runProjectOsAnalysis } from "./project_os_analysis_runner";
import {
  deleteWorkProject,
  linkWorkProjectFolder,
  toggleWorkProjectAutoSync,
  updateWorkIssuePriority,
  updateWorkIssueStatus,
  updateWorkProjectDates,
  updateWorkProjectStatus,
  workOsState,
  type WorkItem,
  type WorkProject,
} from "./work_os_store";
import {
  DatabaseBar,
  EmptyRow,
  PrioritySelect,
  ProjectStatusSelect,
  SELECT_CLASS,
  StatusSelect,
  TableHeader,
  TableText,
} from "./work_os_dashboard_parts";

const ROW_BUTTON_CLASS =
  "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xs border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-secondary transition-colors hover:bg-ghost-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60";

function ProjectList(props: { projects: readonly WorkProject[] }) {
  const [linkingProjectId, setLinkingProjectId] = createSignal<string | null>(null);
  const [runningProjectId, setRunningProjectId] = createSignal<string | null>(null);

  async function linkProjectFolder(project: WorkProject): Promise<void> {
    if (linkingProjectId() !== null) return;
    setLinkingProjectId(project.id);
    try {
      const path = await chooseProjectOsFolder();
      if (path === null) return;
      linkWorkProjectFolder(project.id, { path, name: folderNameFromPath(path) });
    } finally {
      setLinkingProjectId(null);
    }
  }

  async function analyzeProject(project: WorkProject): Promise<void> {
    if (runningProjectId() !== null) return;
    setRunningProjectId(project.id);
    try {
      await runProjectOsAnalysis(project);
    } finally {
      setRunningProjectId(null);
    }
  }

  return (
    <div class="mt-3 min-w-0 overflow-hidden rounded-xs border border-border bg-bg-primary">
      <DatabaseBar
        count={props.projects.length}
        label="Project database"
        properties="Status / Folder / Sync / Work"
      />
      <TableHeader columns="2xl:grid 2xl:grid-cols-[minmax(12rem,1fr)_7rem_minmax(12rem,0.8fr)_minmax(13rem,1fr)_minmax(13rem,1fr)_6rem_5rem]">
        <span>Project</span>
        <span>Status</span>
        <span>Range</span>
        <span>Folder</span>
        <span>Sync</span>
        <span>Work</span>
        <span>Action</span>
      </TableHeader>
      <Show when={props.projects.length > 0} fallback={<EmptyRow label="No projects yet" />}>
        <For each={props.projects}>
          {(project) => (
            <article class="grid min-w-0 gap-2 border-b border-border p-2.5 transition-colors last:border-b-0 hover:bg-ghost-hover 2xl:grid-cols-[minmax(12rem,1fr)_7rem_minmax(12rem,0.8fr)_minmax(13rem,1fr)_minmax(13rem,1fr)_6rem_5rem] 2xl:items-start">
              <div class="min-w-0 2xl:self-start">
                <p class="truncate text-sm font-medium text-text-primary">{project.name}</p>
                <p class="mt-1 truncate text-[0.75rem] text-text-muted">
                  created {formatDate(project.createdAt)}
                </p>
              </div>
              <ProjectStatusSelect
                value={project.status}
                onChange={(status) => updateWorkProjectStatus(project.id, status)}
              />
              <div class="grid min-w-0 gap-1">
                <input
                  class={SELECT_CLASS}
                  aria-label={`Project start date for ${project.name}`}
                  type="date"
                  value={project.startDate ?? ""}
                  onInput={(event) =>
                    updateWorkProjectDates(
                      project.id,
                      event.currentTarget.value || null,
                      project.endDate,
                    )
                  }
                />
                <input
                  class={SELECT_CLASS}
                  aria-label={`Project end date for ${project.name}`}
                  type="date"
                  value={project.endDate ?? ""}
                  onInput={(event) =>
                    updateWorkProjectDates(
                      project.id,
                      project.startDate,
                      event.currentTarget.value || null,
                    )
                  }
                />
              </div>
              <ProjectFolderCell
                project={project}
                linking={linkingProjectId() === project.id}
                onLink={() => void linkProjectFolder(project)}
              />
              <ProjectSyncCell
                project={project}
                running={runningProjectId() === project.id || project.manualSync.status === "running"}
                onAnalyze={() => void analyzeProject(project)}
              />
              <TableText value={`${activeTaskCountForProject(project.id)} open`} />
              <button
                type="button"
                class="rounded-xs border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-secondary transition-colors hover:bg-ghost-hover hover:text-text-primary"
                title="Delete project and unlink tasks/issues"
                onClick={() => deleteWorkProject(project.id)}
              >
                Delete
              </button>
              <IssueRows issues={issuesForProject(project.id)} />
            </article>
          )}
        </For>
      </Show>
    </div>
  );
}

function ProjectFolderCell(props: {
  project: WorkProject;
  linking: boolean;
  onLink: () => void;
}) {
  return (
    <div class="grid min-w-0 gap-1 rounded-xs bg-bg-secondary/70 px-2 py-1">
      <button type="button" class={ROW_BUTTON_CLASS} disabled={props.linking} onClick={props.onLink}>
        <FolderIcon size={13} />
        <span>{props.linking ? "Opening..." : "Link Folder"}</span>
      </button>
      <Show
        when={props.project.linkedFolder}
        fallback={<p class="truncate text-[0.75rem] text-text-muted">No folder linked</p>}
      >
        {(folder) => (
          <div class="min-w-0">
            <p class="truncate text-[0.75rem] font-medium text-text-secondary">{folder().name}</p>
            <p class="truncate font-mono text-[0.6875rem] text-text-muted">{folder().path}</p>
          </div>
        )}
      </Show>
    </div>
  );
}

function ProjectSyncCell(props: {
  project: WorkProject;
  running: boolean;
  onAnalyze: () => void;
}) {
  return (
    <div class="grid min-w-0 gap-1 rounded-xs bg-bg-secondary/70 px-2 py-1">
      <button
        type="button"
        class={ROW_BUTTON_CLASS}
        disabled={props.running || props.project.linkedFolder === null}
        onClick={props.onAnalyze}
      >
        <SparklesIcon size={13} />
        <span>{props.running ? "Analyzing..." : "Analyze/Sync Project"}</span>
      </button>
      <label class="flex min-w-0 items-center gap-1.5 text-[0.75rem] text-text-secondary">
        <input
          type="checkbox"
          checked={props.project.autoSyncEnabled}
          onChange={(event) => toggleWorkProjectAutoSync(props.project.id, event.currentTarget.checked)}
        />
        <span>Auto Sync</span>
      </label>
      <p class="truncate text-[0.75rem] text-text-muted">{manualSyncCopy(props.project)}</p>
      <ProjectReceipt project={props.project} />
    </div>
  );
}

function ProjectReceipt(props: { project: WorkProject }) {
  return (
    <Show when={props.project.lastProjectOsRunReceipt}>
      {(receipt) => (
        <div class="min-w-0 border-t border-border pt-1">
          <p class="truncate text-[0.75rem] text-text-secondary">
            {receipt().status === "applied"
              ? "Latest sync found work that moves this project forward"
              : "Latest sync could not safely apply work that moves this project forward"}
          </p>
          <p class="truncate text-[0.75rem] text-text-muted">{receipt().summary}</p>
          <p class="font-mono text-[0.6875rem] text-text-muted">
            {receipt().createdIssueIds.length} new / {receipt().updatedIssueIds.length} updated
          </p>
        </div>
      )}
    </Show>
  );
}

function IssueRows(props: { issues: readonly WorkItem[] }) {
  return (
    <div class="min-w-0 2xl:col-span-7">
      <Show
        when={props.issues.length > 0}
        fallback={<p class="text-[0.75rem] text-text-muted">No linked issues</p>}
      >
        <div class="grid gap-1">
          <For each={props.issues}>
            {(issue) => (
              <div class="grid min-w-0 gap-2 rounded-xs border border-border bg-bg-secondary/70 p-2 md:grid-cols-[minmax(16rem,1fr)_6.5rem_6.5rem] md:items-start">
                <IssueCopy issue={issue} />
                <PrioritySelect
                  value={issue.priority}
                  onChange={(priority) => updateWorkIssuePriority(issue.id, priority)}
                />
                <StatusSelect
                  value={issue.status}
                  onChange={(status) => updateWorkIssueStatus(issue.id, status)}
                />
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function IssueCopy(props: { issue: WorkItem }) {
  return (
    <div class="min-w-0">
      <p class="break-words text-[0.75rem] font-medium leading-snug text-text-primary">
        {props.issue.title}
      </p>
      <Show when={props.issue.userOutcome}>
        <p class="mt-1 text-[0.75rem] text-text-secondary">Outcome: {props.issue.userOutcome}</p>
      </Show>
      <Show when={props.issue.nextAction}>
        <p class="mt-1 text-[0.75rem] text-text-secondary">Next: {props.issue.nextAction}</p>
      </Show>
      <Show when={issueReasonLine(props.issue)}>
        <p class="mt-1 text-[0.6875rem] text-text-muted">{issueReasonLine(props.issue)}</p>
      </Show>
      <details class="mt-1 text-[0.6875rem] text-text-muted">
        <summary class="cursor-pointer text-text-secondary">Technical details and source evidence</summary>
        <p class="mt-1 whitespace-pre-wrap">{props.issue.technicalDetails || "No technical details recorded."}</p>
        <Show when={props.issue.sourceEvidence.length > 0}>
          <ul class="mt-1 list-inside list-disc font-mono">
            <For each={props.issue.sourceEvidence}>{(path) => <li>{path}</li>}</For>
          </ul>
        </Show>
      </details>
    </div>
  );
}

function activeTaskCountForProject(projectId: string): number {
  return workOsState.tasks.filter((task) => task.projectId === projectId && task.status !== "done")
    .length;
}

function issuesForProject(projectId: string): WorkItem[] {
  return workOsState.issues.filter((issue) => issue.projectId === projectId);
}

function manualSyncCopy(project: WorkProject): string {
  switch (project.manualSync.status) {
    case "idle":
      return project.linkedFolder === null ? "Link a folder to analyze" : "Ready for manual sync";
    case "running":
      return "Scanning the linked folder";
    case "succeeded":
      return "Synced work that moves this project forward";
    case "failed":
      return project.manualSync.error || "Project sync stopped before changing issues";
  }
}

function issueReasonLine(issue: WorkItem): string {
  return [issue.summary, issue.statusReason, issue.priorityReason].filter(Boolean).join(" ");
}

function folderNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

export { ProjectList };
