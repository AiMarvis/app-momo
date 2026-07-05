import { For, Show, type JSX } from "solid-js";

import {
  PROJECT_STATUSES,
  WORK_ITEM_STATUSES,
  WORK_PRIORITIES,
  workOsState,
  type WorkItem,
  type WorkItemStatus,
  type WorkPriority,
  type WorkProjectStatus,
} from "./work_os_store";

const SELECT_CLASS =
  "w-full rounded-xs border border-border bg-bg-secondary/70 px-2 py-1.5 font-mono text-[0.75rem] text-text-secondary outline-none transition-colors focus:border-border-focused";
const INPUT_CLASS =
  "min-w-0 rounded-xs border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-border-focused";
const BUTTON_CLASS =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xs border border-border bg-bg-primary px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-ghost-hover hover:text-text-primary";

function Metric(props: { label: string; value: number }) {
  return (
    <div class="rounded-xs border border-border bg-bg-primary px-2 py-1.5">
      <p class="text-[0.6875rem] text-text-muted">{props.label}</p>
      <p class="mt-0.5 font-mono text-sm font-semibold text-text-primary">{props.value}</p>
    </div>
  );
}

function SectionHeader(props: { title: string; detail: string }) {
  return (
    <div>
      <h2 class="text-sm font-semibold text-text-primary">{props.title}</h2>
      <p class="mt-1 text-xs text-text-secondary">{props.detail}</p>
    </div>
  );
}

function DailySignal(props: { label: string; value: number; detail: string }) {
  return (
    <div class="rounded-xs border border-border bg-bg-primary px-3 py-2">
      <div class="flex items-baseline justify-between gap-3">
        <p class="text-xs text-text-secondary">{props.label}</p>
        <p class="font-mono text-sm font-semibold text-text-primary">{props.value}</p>
      </div>
      <p class="mt-1 truncate text-[0.75rem] text-text-muted">{props.detail}</p>
    </div>
  );
}

function WorkItemList(props: {
  items: readonly WorkItem[];
  emptyLabel: string;
  onPriority: (id: string, priority: WorkPriority) => void;
  onStatus: (id: string, status: WorkItemStatus) => void;
  onDate: (id: string, scheduleDate: string | null) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div class="mt-3 min-w-0 overflow-hidden rounded-xs border border-border bg-bg-primary">
      <DatabaseBar
        count={props.items.length}
        label="Daily to-do list"
        properties="Status / Priority / Project / Date"
      />
      <TableHeader columns="2xl:grid 2xl:grid-cols-[minmax(12rem,1fr)_7rem_7rem_10rem_8rem_5rem]">
        <span>To-do</span>
        <span>Status</span>
        <span>Priority</span>
        <span>Project</span>
        <span>Date</span>
        <span>Action</span>
      </TableHeader>
      <Show when={props.items.length > 0} fallback={<EmptyRow label={props.emptyLabel} />}>
        <For each={props.items}>
          {(item) => (
            <article class="grid min-w-0 gap-2 border-b border-border p-2.5 transition-colors last:border-b-0 hover:bg-ghost-hover 2xl:grid-cols-[minmax(12rem,1fr)_7rem_7rem_10rem_8rem_5rem] 2xl:items-center">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-text-primary">{item.title}</p>
                <p class="mt-1 truncate text-[0.75rem] text-text-muted">
                  created {formatDate(item.createdAt)}
                </p>
              </div>
              <StatusSelect
                value={item.status}
                onChange={(status) => props.onStatus(item.id, status)}
              />
              <PrioritySelect
                value={item.priority}
                onChange={(priority) => props.onPriority(item.id, priority)}
              />
              <TableText value={projectNameFor(item.projectId) ?? "No project"} />
              <input
                class={SELECT_CLASS}
                aria-label={`To-do date for ${item.title}`}
                type="date"
                value={item.scheduleDate ?? ""}
                onInput={(event) => props.onDate(item.id, event.currentTarget.value || null)}
              />
              <button
                type="button"
                class="rounded-xs border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-secondary transition-colors hover:bg-ghost-hover hover:text-text-primary"
                onClick={() => props.onDelete(item.id)}
              >
                Delete
              </button>
            </article>
          )}
        </For>
      </Show>
    </div>
  );
}

function DatabaseBar(props: { label: string; count: number; properties: string }) {
  return (
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-bg-primary px-2.5 py-2">
      <div class="flex min-w-0 items-center gap-2">
        <p class="truncate text-[0.75rem] font-semibold text-text-secondary">{props.label}</p>
        <span class="rounded-xs border border-border bg-bg-secondary/70 px-1.5 py-0.5 font-mono text-[0.625rem] text-text-muted">
          {props.count} rows
        </span>
      </div>
      <p class="truncate font-mono text-[0.6875rem] text-text-muted">{props.properties}</p>
    </div>
  );
}

function TableHeader(props: { columns: string; children: JSX.Element }) {
  return (
    <div
      class={`hidden border-b border-border bg-bg-secondary/70 px-2.5 py-1.5 text-[0.6875rem] font-semibold tracking-[0.12em] text-text-muted uppercase ${props.columns}`}
    >
      {props.children}
    </div>
  );
}

function TableText(props: { value: string }) {
  return (
    <p class="min-w-0 truncate rounded-xs border border-transparent bg-bg-secondary/70 px-2 py-1 text-[0.75rem] text-text-secondary">
      {props.value}
    </p>
  );
}

function EmptyRow(props: { label: string }) {
  return (
    <p class="rounded-xs border border-dashed border-border bg-bg-primary px-3 py-3 text-sm text-text-muted">
      {props.label}
    </p>
  );
}

function ProjectSelect(props: {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
}) {
  return (
    <select
      class={SELECT_CLASS}
      aria-label={props.label ?? "Project"}
      value={props.value ?? ""}
      onChange={(event) => props.onChange(event.currentTarget.value || null)}
    >
      <option value="">No project</option>
      <For each={workOsState.projects}>
        {(project) => <option value={project.id}>{project.name}</option>}
      </For>
    </select>
  );
}

function StatusSelect(props: { value: WorkItemStatus; onChange: (value: WorkItemStatus) => void }) {
  return (
    <select
      class={SELECT_CLASS}
      aria-label="Work status"
      value={props.value}
      onChange={(event) =>
        props.onChange(workItemStatusFromValue(event.currentTarget.value, props.value))
      }
    >
      <For each={WORK_ITEM_STATUSES}>{(status) => <option value={status}>{status}</option>}</For>
    </select>
  );
}

function ProjectStatusSelect(props: {
  value: WorkProjectStatus;
  onChange: (value: WorkProjectStatus) => void;
}) {
  return (
    <select
      class={SELECT_CLASS}
      aria-label="Project status"
      value={props.value}
      onChange={(event) =>
        props.onChange(workProjectStatusFromValue(event.currentTarget.value, props.value))
      }
    >
      <For each={PROJECT_STATUSES}>{(status) => <option value={status}>{status}</option>}</For>
    </select>
  );
}

function PrioritySelect(props: { value: WorkPriority; onChange: (value: WorkPriority) => void }) {
  return (
    <select
      class={SELECT_CLASS}
      aria-label="Work priority"
      value={props.value}
      onChange={(event) => props.onChange(priorityFromValue(event.currentTarget.value, props.value))}
    >
      <For each={WORK_PRIORITIES}>{(priority) => <option value={priority}>{priority}</option>}</For>
    </select>
  );
}

function projectNameFor(projectId: string | null): string | null {
  if (!projectId) return null;
  return workOsState.projects.find((project) => project.id === projectId)?.name ?? null;
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function workItemStatusFromValue(value: string, fallback: WorkItemStatus): WorkItemStatus {
  return WORK_ITEM_STATUSES.find((status) => status === value) ?? fallback;
}

function workProjectStatusFromValue(value: string, fallback: WorkProjectStatus): WorkProjectStatus {
  return PROJECT_STATUSES.find((status) => status === value) ?? fallback;
}

function priorityFromValue(value: string, fallback: WorkPriority): WorkPriority {
  return WORK_PRIORITIES.find((priority) => priority === value) ?? fallback;
}

export {
  BUTTON_CLASS,
  DailySignal,
  DatabaseBar,
  EmptyRow,
  INPUT_CLASS,
  Metric,
  PrioritySelect,
  ProjectSelect,
  ProjectStatusSelect,
  SELECT_CLASS,
  SectionHeader,
  StatusSelect,
  TableHeader,
  TableText,
  WorkItemList,
};
