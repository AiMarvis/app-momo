import { For, Show, createMemo } from "solid-js";

import { dateKeysInRange, localDateKey, monthLabel, monthStartForDateKey } from "./work_os_dates";
import { EmptyRow, SectionHeader } from "./work_os_dashboard_parts";
import { workOsState, type WorkItem, type WorkProject } from "./work_os_store";

interface ProjectRangeView {
  readonly project: WorkProject;
  readonly startDay: number;
  readonly endDay: number;
  readonly doneCount: number;
  readonly totalCount: number;
}

function RangeSidebar() {
  const activeMonth = createMemo(() => activeRangeMonth(workOsState.projects));
  const monthDayCount = createMemo(() => daysInMonth(activeMonth()));
  const ranges = createMemo(() => projectRangesForMonth(activeMonth(), monthDayCount()));

  return (
    <aside class="rounded-xs border border-border bg-bg-secondary/70 p-4" aria-label="Project range sidebar">
      <SectionHeader title="Project ranges" detail="Scheduled windows with task and issue progress" />
      <div class="mt-3 rounded-xs border border-border bg-bg-primary p-2.5">
        <div class="flex items-center justify-between gap-2">
          <p class="font-mono text-xs text-text-secondary">{monthLabel(activeMonth())}</p>
          <p class="font-mono text-[0.6875rem] text-text-muted">{ranges().length} ranges</p>
        </div>
        <div class="mt-2 grid grid-cols-[repeat(31,minmax(0,1fr))] text-[0.625rem] text-text-muted">
          <span>1</span>
          <span class="col-start-[15]">15</span>
          <span class="col-start-[31] text-right">{monthDayCount()}</span>
        </div>
      </div>
      <div class="mt-3 grid gap-2">
        <Show when={ranges().length > 0} fallback={<EmptyRow label="No project ranges this month" />}>
          <For each={ranges()}>
            {(range) => (
              <article class="rounded-xs border border-border bg-bg-primary p-2.5">
                <div class="flex min-w-0 items-center justify-between gap-2">
                  <p class="truncate text-sm font-medium text-text-primary">{range.project.name}</p>
                  <p class="font-mono text-[0.6875rem] text-text-muted">{range.project.status}</p>
                </div>
                <div class="mt-2 grid h-2 grid-cols-[repeat(31,minmax(0,1fr))] overflow-hidden rounded-xs bg-bg-tertiary">
                  <span
                    class="rounded-xs bg-text-secondary"
                    style={{ "grid-column": `${range.startDay} / ${range.endDay + 1}` }}
                  />
                </div>
                <div class="mt-2 flex items-center justify-between gap-2">
                  <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-xs bg-bg-tertiary">
                    <div
                      class="h-full rounded-xs bg-text-primary"
                      style={{ width: `${progressPercent(range)}%` }}
                    />
                  </div>
                  <p class="font-mono text-[0.6875rem] text-text-muted">
                    {range.doneCount}/{range.totalCount} done
                  </p>
                </div>
              </article>
            )}
          </For>
        </Show>
      </div>
    </aside>
  );
}

function activeRangeMonth(projects: readonly WorkProject[]): Date {
  const currentMonth = monthStartForDateKey(localDateKey(new Date())) ?? new Date();
  const currentKey = localDateKey(currentMonth).slice(0, 7);
  if (
    projects.some((project) =>
      dateKeysInRange(project.startDate, project.endDate).some((key) => key.startsWith(currentKey)),
    )
  ) {
    return currentMonth;
  }
  const firstProjectDate = projects.find((project) => project.startDate)?.startDate ?? null;
  return firstProjectDate ? (monthStartForDateKey(firstProjectDate) ?? currentMonth) : currentMonth;
}

function projectRangesForMonth(monthStart: Date, monthDayCount: number): ProjectRangeView[] {
  const monthFirstKey = localDateKey(monthStart);
  const monthLast = new Date(monthStart);
  monthLast.setDate(monthDayCount);
  const monthLastKey = localDateKey(monthLast);

  return workOsState.projects.flatMap((project) => {
    if (!project.startDate || !project.endDate) return [];
    if (project.endDate < monthFirstKey || project.startDate > monthLastKey) return [];
    const startDay = project.startDate < monthFirstKey ? 1 : Number(project.startDate.slice(8, 10));
    const endDay = project.endDate > monthLastKey ? monthDayCount : Number(project.endDate.slice(8, 10));
    return [{ project, startDay, endDay, ...projectProgress(project.id) }];
  });
}

function projectProgress(projectId: string): Pick<ProjectRangeView, "doneCount" | "totalCount"> {
  const items = [
    ...workOsState.tasks.filter((task) => task.projectId === projectId),
    ...workOsState.issues.filter((issue) => issue.projectId === projectId),
  ];
  return {
    doneCount: items.filter((item) => item.status === "done").length,
    totalCount: items.length,
  };
}

function progressPercent(range: Pick<ProjectRangeView, "doneCount" | "totalCount">): number {
  if (range.totalCount === 0) return 0;
  return Math.round((range.doneCount / range.totalCount) * 100);
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export { RangeSidebar };
