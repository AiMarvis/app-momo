import { For, Show, createMemo } from "solid-js";

import { EmptyRow, SectionHeader } from "./work_os_dashboard_parts";
import { dateKeysInRange, localDateKey, monthLabel, monthStartForDateKey } from "./work_os_dates";
import { workOsState, type WorkItem, type WorkProject } from "./work_os_store";

type CalendarEntryKind = "To-do" | "Project";

interface CalendarEntry {
  readonly id: string;
  readonly kind: CalendarEntryKind;
  readonly title: string;
  readonly date: string;
  readonly detail: string;
}

interface CalendarDay {
  readonly key: string;
  readonly label: string;
  readonly inMonth: boolean;
  readonly entries: readonly CalendarEntry[];
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function CalendarSection() {
  const todayKey = localDateKey(new Date());
  const entries = createMemo(() => collectCalendarEntries());
  const activeMonth = createMemo(() => activeMonthFor(entries()));
  const days = createMemo(() => buildCalendarDays(activeMonth(), entries()));

  return (
    <section class="min-w-0 rounded-xs border border-border bg-bg-secondary/70 p-4">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <SectionHeader title="Calendar" detail="Daily to-dos and project ranges by date" />
        <p class="rounded-xs border border-border bg-bg-primary px-2 py-1 font-mono text-xs text-text-secondary">
          {monthLabel(activeMonth())}
        </p>
      </div>
      <div class="mt-3 min-w-0 overflow-hidden rounded-xs border border-border bg-bg-primary">
        <div class="grid grid-cols-7 border-b border-border bg-bg-secondary/70">
          <For each={WEEKDAY_LABELS}>
            {(weekday) => (
              <div class="border-r border-border px-2 py-1.5 text-[0.6875rem] font-semibold tracking-[0.12em] text-text-muted uppercase last:border-r-0">
                {weekday}
              </div>
            )}
          </For>
        </div>
        <div class="grid grid-cols-7">
          <For each={days()}>
            {(day, index) => (
              <section
                class="min-h-24 min-w-0 border-r border-b border-border p-2 transition-colors"
                classList={{
                  "border-r-0": (index() + 1) % 7 === 0,
                  "bg-bg-secondary/30": !day.inMonth,
                  "bg-ghost-selected": day.key === todayKey,
                  "text-text-disabled": !day.inMonth,
                }}
              >
                <div class="flex items-center justify-between gap-1">
                  <span
                    class="font-mono text-[0.75rem] text-text-secondary"
                    classList={{ "text-text-primary": day.key === todayKey }}
                  >
                    {day.label}
                  </span>
                  <Show when={day.entries.length > 0}>
                    <span class="rounded-xs bg-bg-secondary px-1 font-mono text-[0.625rem] text-text-muted">
                      {day.entries.length}
                    </span>
                  </Show>
                </div>
                <div class="mt-1 grid gap-1">
                  <For each={day.entries.slice(0, 2)}>
                    {(entry) => (
                      <article
                        class="min-w-0 rounded-xs border border-border bg-bg-secondary/80 px-1.5 py-1"
                        title={`${entry.kind}: ${entry.title} - ${entry.detail}`}
                      >
                        <div class="flex min-w-0 items-center gap-1.5">
                          <span
                            class="h-1.5 w-1.5 shrink-0 rounded-full bg-text-muted"
                            classList={{ "bg-text-primary": entry.kind === "Project" }}
                          />
                          <p class="truncate text-[0.6875rem] font-medium text-text-primary">
                            {entry.title}
                          </p>
                        </div>
                        <p class="mt-0.5 truncate text-[0.625rem] text-text-muted">
                          {entry.detail}
                        </p>
                      </article>
                    )}
                  </For>
                  <Show when={day.entries.length > 2}>
                    <p class="font-mono text-[0.625rem] text-text-muted">
                      +{day.entries.length - 2} more
                    </p>
                  </Show>
                </div>
              </section>
            )}
          </For>
        </div>
      </div>
      <Show when={entries().length === 0}>
        <div class="mt-2">
          <EmptyRow label="No scheduled work yet" />
        </div>
      </Show>
    </section>
  );
}

function collectCalendarEntries(): CalendarEntry[] {
  return [
    ...workOsState.tasks.flatMap((task) => compactTaskCalendarEntry(task)),
    ...workOsState.projects.flatMap((project) => compactProjectCalendarEntry(project)),
  ].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.kind.localeCompare(right.kind) ||
      left.title.localeCompare(right.title),
  );
}

function compactTaskCalendarEntry(task: WorkItem): CalendarEntry[] {
  if (!task.scheduleDate) return [];
  return [
    {
      id: task.id,
      kind: "To-do",
      title: task.title,
      date: task.scheduleDate,
      detail: `${projectNameFor(task.projectId)} / ${task.status} / ${task.priority}`,
    },
  ];
}

function compactProjectCalendarEntry(project: WorkProject): CalendarEntry[] {
  const dateKeys = dateKeysInRange(project.startDate, project.endDate);
  return dateKeys.map((date) => ({
    id: `${project.id}-${date}`,
    kind: "Project",
    title: project.name,
    date,
    detail: projectRangeDetail(project, date),
  }));
}

function projectRangeDetail(project: WorkProject, date: string): string {
  if (project.startDate === project.endDate) return `${project.status} project date`;
  if (date === project.startDate) return `${project.status} project starts`;
  if (date === project.endDate) return `${project.status} project ends`;
  return `${project.status} project range`;
}

function activeMonthFor(entries: readonly CalendarEntry[]): Date {
  const currentMonth = monthStartForDateKey(localDateKey(new Date())) ?? new Date();
  const currentMonthKey = calendarMonthKey(currentMonth);
  if (entries.some((entry) => entry.date.startsWith(currentMonthKey))) return currentMonth;

  const firstScheduledMonth = entries[0] ? monthStartForDateKey(entries[0].date) : null;
  return firstScheduledMonth ?? currentMonth;
}

function buildCalendarDays(monthStart: Date, entries: readonly CalendarEntry[]): CalendarDay[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstCell = new Date(year, month, 1 - monthStart.getDay());
  const entriesByDate = groupEntriesByDate(entries);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + index);
    const key = localDateKey(date);
    return {
      key,
      label: String(date.getDate()),
      inMonth: date.getMonth() === month,
      entries: entriesByDate.get(key) ?? [],
    };
  });
}

function groupEntriesByDate(entries: readonly CalendarEntry[]): Map<string, CalendarEntry[]> {
  const groups = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    groups.set(entry.date, [...(groups.get(entry.date) ?? []), entry]);
  }
  return groups;
}

function calendarMonthKey(date: Date): string {
  return localDateKey(date).slice(0, 7);
}

function projectNameFor(projectId: string | null): string {
  if (!projectId) return "No project";
  return workOsState.projects.find((project) => project.id === projectId)?.name ?? "Missing project";
}

export { CalendarSection };
