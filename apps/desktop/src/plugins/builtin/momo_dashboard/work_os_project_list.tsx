// @allow SIZE_OK - legacy Project OS list view owns existing panels; this change only renders the persisted Git receipt.
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
  type ProjectOsGitReceipt,
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
} from "./work_os_dashboard_parts";

const ROW_BUTTON_CLASS =
  "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xs border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-secondary transition-colors hover:bg-ghost-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60";

const PROJECT_ISSUE_STATUS_GROUPS = [
  { id: "todo", label: "해야 할 일" },
  { id: "doing", label: "진행 중" },
  { id: "done", label: "완료" },
] as const;

type ProjectIssueStatusGroup = (typeof PROJECT_ISSUE_STATUS_GROUPS)[number]["id"];

function ProjectList(props: { projects: readonly WorkProject[] }) {
  const [linkingProjectId, setLinkingProjectId] = createSignal<string | null>(null);
  const [runningProjectId, setRunningProjectId] = createSignal<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = createSignal<string | null>(null);
  const selectedProject = () =>
    props.projects.find((project) => project.id === selectedProjectId()) ?? null;

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
    <>
      <div class="mt-3 min-w-0 overflow-hidden rounded-xs border border-border bg-bg-primary">
        <DatabaseBar
          count={props.projects.length}
          label="Project database"
          properties="Status / Period / Folder / Sync / Issues"
        />
        <TableHeader columns="2xl:grid 2xl:grid-cols-[minmax(12rem,1fr)_7rem_minmax(12rem,0.8fr)_minmax(13rem,1fr)_minmax(13rem,1fr)_6rem_5rem]">
          <span>Project</span>
          <span>Status</span>
          <span>Range</span>
          <span>Folder</span>
          <span>Sync</span>
          <span>Issues</span>
          <span>Action</span>
        </TableHeader>
        <Show when={props.projects.length > 0} fallback={<EmptyRow label="No projects yet" />}>
          <For each={props.projects}>
            {(project) => {
              const projectIssues = () => issuesForProject(project.id);
              return (
                <article class="grid min-w-0 gap-2 border-b border-border p-2.5 transition-colors last:border-b-0 hover:bg-ghost-hover 2xl:grid-cols-[minmax(12rem,1fr)_7rem_minmax(12rem,0.8fr)_minmax(13rem,1fr)_minmax(13rem,1fr)_6rem_5rem] 2xl:items-start">
                  <button
                    type="button"
                    class="focus:border-border-strong min-w-0 rounded-xs px-1 py-0.5 text-left transition-colors hover:bg-bg-secondary focus:outline-none 2xl:self-start"
                    aria-label={`Open Project OS issues for ${project.name}`}
                    onClick={() => setSelectedProjectId(project.id)}
                  >
                    <p class="truncate text-sm font-medium text-text-primary">{project.name}</p>
                    <p class="mt-1 truncate text-[0.75rem] text-text-muted">
                      {formatProjectRange(project)}
                    </p>
                  </button>
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
                    running={
                      runningProjectId() === project.id || project.manualSync.status === "running"
                    }
                    onAnalyze={() => void analyzeProject(project)}
                  />
                  <ProjectIssueBadges counts={projectIssueStatusCounts(projectIssues())} />
                  <button
                    type="button"
                    class="rounded-xs border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-secondary transition-colors hover:bg-ghost-hover hover:text-text-primary"
                    title="Delete project and unlink tasks/issues"
                    onClick={() => deleteWorkProject(project.id)}
                  >
                    Delete
                  </button>
                </article>
              );
            }}
          </For>
        </Show>
      </div>
      <Show when={selectedProject()}>
        {(project) => (
          <ProjectIssueDialog
            project={project()}
            issues={issuesForProject(project().id)}
            onClose={() => setSelectedProjectId(null)}
          />
        )}
      </Show>
    </>
  );
}

function ProjectIssueDialog(props: {
  project: WorkProject;
  issues: readonly WorkItem[];
  onClose: () => void;
}) {
  const titleId = `project-issues-${props.project.id}`;
  const counts = () => projectIssueStatusCounts(props.issues);

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={props.onClose}
    >
      <div
        class="flex h-full max-h-[min(760px,calc(100vh-3rem))] w-full max-w-5xl flex-col overflow-hidden rounded-xs border border-border bg-bg-primary shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div class="min-w-0">
            <h2 id={titleId} class="truncate text-sm font-semibold text-text-primary">
              {props.project.name}
            </h2>
            <p class="text-[0.75rem] break-words text-text-muted">
              {formatProjectRange(props.project)} / {props.project.status} /{" "}
              {folderCopy(props.project)}
            </p>
          </div>
          <button type="button" class={ROW_BUTTON_CLASS} onClick={props.onClose}>
            Close
          </button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <div class="mb-3 flex min-w-0 flex-wrap gap-1.5">
            <ProjectIssueBadges counts={counts()} />
          </div>
          <ProjectReceipt project={props.project} />
          <IssueStatusColumns issues={props.issues} />
        </div>
      </div>
    </div>
  );
}

function ProjectIssueBadges(props: { counts: Record<ProjectIssueStatusGroup, number> }) {
  return (
    <div class="flex min-w-0 flex-wrap gap-1">
      <For each={PROJECT_ISSUE_STATUS_GROUPS}>
        {(group) => (
          <span class="inline-flex items-center gap-1 rounded-xs border border-border bg-bg-secondary px-1.5 py-0.5 text-[0.6875rem] text-text-secondary">
            <span>{group.id}</span>
            <span class="font-mono text-text-primary">{props.counts[group.id]}</span>
          </span>
        )}
      </For>
    </div>
  );
}

function ProjectFolderCell(props: { project: WorkProject; linking: boolean; onLink: () => void }) {
  return (
    <div class="grid min-w-0 gap-1 rounded-xs bg-bg-secondary/70 px-2 py-1">
      <button
        type="button"
        class={ROW_BUTTON_CLASS}
        disabled={props.linking}
        onClick={props.onLink}
      >
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

function ProjectSyncCell(props: { project: WorkProject; running: boolean; onAnalyze: () => void }) {
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
          onChange={(event) =>
            toggleWorkProjectAutoSync(props.project.id, event.currentTarget.checked)
          }
        />
        <span>Auto Sync</span>
      </label>
      <p class="truncate text-[0.75rem] text-text-muted">{manualSyncCopy(props.project)}</p>
    </div>
  );
}

function ProjectReceipt(props: { project: WorkProject }) {
  return (
    <Show when={props.project.lastProjectOsRunReceipt}>
      {(receipt) => (
        <div class="min-w-0 border-t border-border pt-1">
          <p class="text-[0.75rem] break-words text-text-secondary">
            {receipt().status === "applied"
              ? "Latest sync found work that moves this project forward"
              : "Latest sync could not safely apply work that moves this project forward"}
          </p>
          <p class="text-[0.75rem] break-words text-text-muted">{receipt().summary}</p>
          <Show when={receipt().git}>
            {(git) => (
              <div class="mt-1 min-w-0">
                <p class="text-[0.75rem] break-words text-text-secondary">
                  {gitReceiptOwnerLine(git())}
                </p>
                <Show when={git().summary}>
                  <p class="mt-0.5 text-[0.75rem] break-words text-text-muted">{git().summary}</p>
                </Show>
                <details class="mt-1 text-[0.6875rem] break-words text-text-muted">
                  <summary class="cursor-pointer text-text-secondary">Git receipt details</summary>
                  <dl class="mt-1 grid gap-1 font-mono">
                    <div>
                      <dt class="text-text-secondary">Range</dt>
                      <dd>{git().range || "No Git range recorded."}</dd>
                    </div>
                    <div>
                      <dt class="text-text-secondary">Head</dt>
                      <dd>{git().headCommit || "No head commit recorded."}</dd>
                    </div>
                    <div>
                      <dt class="text-text-secondary">Previous</dt>
                      <dd>{git().previousCommit || "No previous commit recorded."}</dd>
                    </div>
                  </dl>
                  <Show when={git().changedPaths.length > 0}>
                    <ul class="mt-1 list-inside list-disc font-mono">
                      <For each={git().changedPaths}>{(path) => <li>{path}</li>}</For>
                    </ul>
                  </Show>
                  <Show when={git().error}>
                    <p class="mt-1 whitespace-pre-wrap">{git().error}</p>
                  </Show>
                </details>
              </div>
            )}
          </Show>
          <p class="font-mono text-[0.6875rem] text-text-muted">
            {receipt().createdIssueIds.length} new / {receipt().updatedIssueIds.length} updated
          </p>
        </div>
      )}
    </Show>
  );
}

function IssueStatusColumns(props: { issues: readonly WorkItem[] }) {
  return (
    <div class="mt-3 min-w-0">
      <Show
        when={props.issues.length > 0}
        fallback={<p class="text-[0.75rem] text-text-muted">No linked issues</p>}
      >
        <div
          class="grid min-w-0 gap-2 md:grid-cols-3"
          data-project-issue-layout="three-status-columns"
        >
          <For each={PROJECT_ISSUE_STATUS_GROUPS}>
            {(group) => (
              <section class="min-w-0 rounded-xs border border-border bg-bg-secondary/50">
                <header class="flex items-center justify-between gap-2 border-b border-border px-2.5 py-2">
                  <h3 class="text-xs font-medium text-text-primary">{group.label}</h3>
                  <span class="font-mono text-[0.6875rem] text-text-muted">
                    {issuesForStatusGroup(props.issues, group.id).length}
                  </span>
                </header>
                <div class="grid min-w-0 gap-1.5 p-2">
                  <Show
                    when={issuesForStatusGroup(props.issues, group.id).length > 0}
                    fallback={<p class="px-1 py-2 text-[0.75rem] text-text-muted">No issues</p>}
                  >
                    <For each={issuesForStatusGroup(props.issues, group.id)}>
                      {(issue) => <IssueCard issue={issue} />}
                    </For>
                  </Show>
                </div>
              </section>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function IssueCard(props: { issue: WorkItem }) {
  return (
    <article class="grid min-w-0 gap-2 rounded-xs border border-border bg-bg-primary p-2">
      <p class="text-[0.75rem] leading-snug font-medium break-words text-text-primary">
        {props.issue.title}
      </p>
      <Show when={props.issue.userOutcome}>
        <p class="text-[0.75rem] break-words text-text-secondary">Outcome: {props.issue.userOutcome}</p>
      </Show>
      <Show when={props.issue.nextAction}>
        <p class="text-[0.75rem] break-words text-text-secondary">Next: {props.issue.nextAction}</p>
      </Show>
      <Show when={issueReasonLine(props.issue)}>
        <p class="text-[0.6875rem] break-words text-text-muted">{issueReasonLine(props.issue)}</p>
      </Show>
      <div class="grid min-w-0 grid-cols-2 gap-1">
        <PrioritySelect
          value={props.issue.priority}
          onChange={(priority) => updateWorkIssuePriority(props.issue.id, priority)}
        />
        <StatusSelect
          value={props.issue.status}
          onChange={(status) => updateWorkIssueStatus(props.issue.id, status)}
        />
      </div>
      <details class="text-[0.6875rem] break-words text-text-muted">
        <summary class="cursor-pointer text-text-secondary">
          Technical details and source evidence
        </summary>
        <p class="mt-1 whitespace-pre-wrap">
          {props.issue.technicalDetails || "No technical details recorded."}
        </p>
        <Show when={props.issue.sourceEvidence.length > 0}>
          <ul class="mt-1 list-inside list-disc font-mono">
            <For each={props.issue.sourceEvidence}>{(path) => <li>{path}</li>}</For>
          </ul>
        </Show>
      </details>
    </article>
  );
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

function projectIssueStatusCounts(
  issues: readonly WorkItem[],
): Record<ProjectIssueStatusGroup, number> {
  return {
    todo: issues.filter((issue) => issueStatusGroup(issue) === "todo").length,
    doing: issues.filter((issue) => issueStatusGroup(issue) === "doing").length,
    done: issues.filter((issue) => issueStatusGroup(issue) === "done").length,
  };
}

function issuesForStatusGroup(
  issues: readonly WorkItem[],
  group: ProjectIssueStatusGroup,
): readonly WorkItem[] {
  return issues.filter((issue) => issueStatusGroup(issue) === group);
}

function issueStatusGroup(issue: WorkItem): ProjectIssueStatusGroup {
  if (issue.status === "doing" || issue.status === "done") return issue.status;
  return "todo";
}

function formatProjectRange(project: WorkProject): string {
  if (project.startDate && project.endDate) return `${project.startDate} - ${project.endDate}`;
  if (project.startDate) return `${project.startDate} - no end`;
  if (project.endDate) return `No start - ${project.endDate}`;
  return `Created ${formatDate(project.createdAt)}`;
}

function folderCopy(project: WorkProject): string {
  return project.linkedFolder === null ? "No folder linked" : project.linkedFolder.name;
}

function issueReasonLine(issue: WorkItem): string {
  return [issue.summary, issue.statusReason, issue.priorityReason].filter(Boolean).join(" ");
}

function gitReceiptOwnerLine(git: ProjectOsGitReceipt): string {
  switch (git.status) {
    case "summarized":
      return "Git changes were included as evidence";
    case "not_git_repo":
      return "No Git repo detected; manifest analysis used";
    case "failed":
      return "Git summary failed; manifest analysis continued";
  }
  return assertNeverGitReceiptStatus(git.status);
}

function assertNeverGitReceiptStatus(_status: never): never {
  throw new Error("Unhandled Project OS Git receipt status");
}

function folderNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

export { ProjectIssueDialog, ProjectList, projectIssueStatusCounts };
