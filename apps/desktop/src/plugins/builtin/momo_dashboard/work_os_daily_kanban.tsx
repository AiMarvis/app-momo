import { For, Show, createSignal } from "solid-js";

import { CloseIcon, PlusIcon } from "~/components/icons";

import {
  createWorkTask,
  deleteWorkTask,
  updateWorkTaskColor,
  updateWorkTaskDescription,
  updateWorkTaskPriority,
  updateWorkTaskScheduleDate,
  updateWorkTaskStatus,
  updateWorkTaskTitle,
  workOsState,
  type WorkColor,
  type WorkItem,
  type WorkItemStatus,
  type WorkPriority,
} from "./work_os_store";
import {
  BUTTON_CLASS,
  EmptyRow,
  INPUT_CLASS,
  PrioritySelect,
  ProjectSelect,
  SELECT_CLASS,
  SectionHeader,
  StatusSelect,
} from "./work_os_dashboard_parts";
import { WorkColorSwatches, workColorStyle } from "./work_os_color_swatches";

interface KanbanColumn {
  readonly status: WorkItemStatus;
  readonly label: string;
  readonly empty: string;
}

const DAILY_COLUMNS: readonly KanbanColumn[] = [
  { status: "backlog", label: "Backlog", empty: "No backlog" },
  { status: "todo", label: "Todo", empty: "No todo items" },
  { status: "doing", label: "Doing", empty: "Nothing in progress" },
  { status: "done", label: "Done", empty: "Nothing done yet" },
];

function DailyKanbanSection() {
  const [taskTitle, setTaskTitle] = createSignal("");
  const [taskDescription, setTaskDescription] = createSignal("");
  const [taskScheduleDate, setTaskScheduleDate] = createSignal("");
  const [taskProjectId, setTaskProjectId] = createSignal<string | null>(null);
  const [taskPriority, setTaskPriority] = createSignal<WorkPriority>("medium");
  const [taskColor, setTaskColor] = createSignal<WorkColor>("yellow");

  function submitTask(event: SubmitEvent): void {
    event.preventDefault();
    if (!taskTitle().trim()) return;
    createWorkTask({
      title: taskTitle(),
      description: taskDescription(),
      projectId: taskProjectId(),
      priority: taskPriority(),
      color: taskColor(),
      scheduleDate: taskScheduleDate() || null,
    });
    setTaskTitle("");
    setTaskDescription("");
    setTaskScheduleDate("");
  }

  return (
    <section class="rounded-xs border border-border bg-bg-secondary/70 p-4" aria-label="Daily to-do Kanban">
      <SectionHeader title="Daily to-do" detail="Kanban cards for today's work" />
      <form class="mt-3 grid min-w-0 gap-2" onSubmit={submitTask}>
        <input
          class={INPUT_CLASS}
          aria-label="Daily to-do title"
          value={taskTitle()}
          placeholder="Add a daily to-do"
          onInput={(event) => setTaskTitle(event.currentTarget.value)}
        />
        <textarea
          class={`${INPUT_CLASS} min-h-16 resize-none`}
          aria-label="Daily to-do note"
          value={taskDescription()}
          placeholder="Short note"
          onInput={(event) => setTaskDescription(event.currentTarget.value)}
        />
        <div class="grid min-w-0 gap-2 sm:grid-cols-2">
          <ProjectSelect value={taskProjectId()} onChange={setTaskProjectId} label="To-do project" />
          <PrioritySelect value={taskPriority()} onChange={setTaskPriority} />
          <input
            class={SELECT_CLASS}
            aria-label="To-do date"
            type="date"
            value={taskScheduleDate()}
            onInput={(event) => setTaskScheduleDate(event.currentTarget.value)}
          />
          <button type="submit" class={BUTTON_CLASS}>
            <PlusIcon size={14} />
            <span>Add to-do</span>
          </button>
        </div>
        <WorkColorSwatches value={taskColor()} onChange={setTaskColor} label="New to-do color" />
      </form>

      <div class="mt-4 grid min-w-0 gap-2" data-momo-daily-kanban="true">
        <For each={DAILY_COLUMNS}>
          {(column) => (
            <KanbanColumnView
              label={column.label}
              empty={column.empty}
              items={workOsState.tasks.filter((task) => task.status === column.status)}
            />
          )}
        </For>
      </div>
    </section>
  );
}

function KanbanColumnView(props: {
  readonly label: string;
  readonly empty: string;
  readonly items: readonly WorkItem[];
}) {
  return (
    <section class="min-w-0 overflow-hidden rounded-xs border border-border bg-bg-primary p-2.5">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-xs font-semibold text-text-primary">{props.label}</h3>
        <span class="rounded-xs border border-border bg-bg-secondary/70 px-1.5 py-0.5 font-mono text-[0.625rem] text-text-muted">
          {props.items.length}
        </span>
      </div>
      <div class="mt-2 grid min-w-0 gap-2">
        <Show when={props.items.length > 0} fallback={<EmptyRow label={props.empty} />}>
          <For each={props.items}>{(item) => <KanbanCard item={item} />}</For>
        </Show>
      </div>
    </section>
  );
}

function KanbanCard(props: { readonly item: WorkItem }) {
  const colorStyle = () => workColorStyle(props.item.color);

  return (
    <article
      class="min-w-0 overflow-hidden rounded-xs border p-2.5 text-sm"
      style={{
        "background-color": colorStyle().background,
        "border-color": colorStyle().border,
        color: colorStyle().text,
      }}
    >
      <div class="flex min-w-0 items-start justify-between gap-2">
        <input
          class="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-semibold outline-none placeholder:text-text-muted"
          aria-label={`Title for ${props.item.title}`}
          value={props.item.title}
          onChange={(event) => updateWorkTaskTitle(props.item.id, event.currentTarget.value)}
        />
        <button
          type="button"
          class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xs border border-current/30 bg-white/35 transition-colors hover:bg-white/55"
          aria-label={`Delete ${props.item.title}`}
          onClick={() => deleteWorkTask(props.item.id)}
        >
          <CloseIcon size={12} />
        </button>
      </div>
      <textarea
        class="mt-2 min-h-14 w-full resize-none border-0 bg-transparent p-0 text-xs leading-relaxed outline-none placeholder:text-text-muted"
        aria-label={`Note for ${props.item.title}`}
        value={props.item.description}
        placeholder="Add note"
        onChange={(event) => updateWorkTaskDescription(props.item.id, event.currentTarget.value)}
      />
      <div class="mt-2 grid gap-2">
        <StatusSelect
          value={props.item.status}
          onChange={(status) => updateWorkTaskStatus(props.item.id, status)}
        />
        <div class="grid min-w-0 gap-2">
          <PrioritySelect
            value={props.item.priority}
            onChange={(priority) => updateWorkTaskPriority(props.item.id, priority)}
          />
          <input
            class={SELECT_CLASS}
            aria-label={`Date for ${props.item.title}`}
            type="date"
            value={props.item.scheduleDate ?? ""}
            onInput={(event) =>
              updateWorkTaskScheduleDate(props.item.id, event.currentTarget.value || null)
            }
          />
        </div>
        <WorkColorSwatches
          value={props.item.color}
          onChange={(color) => updateWorkTaskColor(props.item.id, color)}
          label={`Color for ${props.item.title}`}
        />
      </div>
    </article>
  );
}

export { DailyKanbanSection };
