import { createMemo, createSignal } from "solid-js";

import { PlusIcon } from "~/components/icons";

import {
  createWorkIssue,
  createWorkProject,
  initWorkOsStore,
  workOsState,
  type WorkPriority,
} from "./work_os_store";
import {
  BUTTON_CLASS,
  INPUT_CLASS,
  Metric,
  PrioritySelect,
  ProjectSelect,
  SectionHeader,
} from "./work_os_dashboard_parts";
import { DailyOverviewSection } from "./work_os_daily_overview";
import { localDateKey } from "./work_os_dates";
import { projectIsScheduledOn } from "./work_os_project_dates";
import { ProjectList } from "./work_os_project_list";

function TodayDashboard() {
  initWorkOsStore();

  const todayKey = localDateKey(new Date());
  const [issueTitle, setIssueTitle] = createSignal("");
  const [projectName, setProjectName] = createSignal("");
  const [projectStartDate, setProjectStartDate] = createSignal("");
  const [projectEndDate, setProjectEndDate] = createSignal("");
  const [issueProjectId, setIssueProjectId] = createSignal<string | null>(null);
  const [issuePriority, setIssuePriority] = createSignal<WorkPriority>("medium");

  const activeTaskCount = createMemo(
    () => workOsState.tasks.filter((task) => task.status !== "done").length,
  );
  const activeProjectCount = createMemo(
    () => workOsState.projects.filter((project) => project.status !== "done").length,
  );
  const scheduledTodayCount = createMemo(
    () =>
      workOsState.tasks.filter((task) => task.status !== "done" && task.scheduleDate === todayKey)
        .length +
      workOsState.projects.filter((project) => projectIsScheduledOn(project, todayKey)).length,
  );
  const inProgressCount = createMemo(
    () =>
      workOsState.tasks.filter((task) => task.status === "doing").length +
      workOsState.issues.filter((issue) => issue.status === "doing").length,
  );
  const nextFocus = createMemo(() => {
    const task =
      workOsState.tasks.find((item) => item.status !== "done" && item.scheduleDate === todayKey) ??
      workOsState.tasks.find((item) => item.status === "doing") ??
      workOsState.tasks.find((item) => item.status !== "done" && item.priority === "high") ??
      workOsState.tasks.find((item) => item.status !== "done");
    if (task) return task.title;

    const project = workOsState.projects.find((item) => item.status === "active");
    return project?.name ?? "No daily focus yet";
  });

  function submitIssue(event: SubmitEvent): void {
    event.preventDefault();
    const projectId = issueProjectId();
    if (!issueTitle().trim() || projectId === null) return;
    createWorkIssue({
      title: issueTitle(),
      projectId,
      priority: issuePriority(),
    });
    setIssueTitle("");
  }

  function submitProject(event: SubmitEvent): void {
    event.preventDefault();
    if (!projectName().trim()) return;
    const project = createWorkProject({
      name: projectName(),
      startDate: projectStartDate() || null,
      endDate: projectEndDate() || null,
    });
    setIssueProjectId(project.id);
    setProjectName("");
    setProjectStartDate("");
    setProjectEndDate("");
  }

  return (
    <main class="h-full overflow-y-auto bg-bg-primary" data-momo-surface="today-dashboard">
      <div class="mx-auto flex min-w-0 w-full max-w-7xl flex-col gap-4 p-4 lg:p-5">
        <header class="rounded-xs border border-border bg-bg-secondary/70 px-4 py-3">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p class="text-[0.6875rem] font-semibold tracking-[0.16em] text-text-muted uppercase">
                Today
              </p>
              <h1 class="mt-1 text-[1.15rem] font-semibold text-text-primary">Today overview</h1>
              <p class="mt-1 max-w-2xl text-xs text-text-secondary">
                Daily to-dos, projects, calendar dates, issues, and ideas in one Work OS surface.
              </p>
            </div>
            <div class="grid min-w-72 grid-cols-2 gap-2 text-right sm:grid-cols-4">
              <Metric label="Today" value={scheduledTodayCount()} />
              <Metric label="Doing" value={inProgressCount()} />
              <Metric label="To-dos" value={activeTaskCount()} />
              <Metric label="Projects" value={activeProjectCount()} />
            </div>
          </div>
        </header>

        <section class="grid min-w-0 gap-4">
            <DailyOverviewSection
              todayKey={todayKey}
              scheduledTodayCount={scheduledTodayCount()} inProgressCount={inProgressCount()}
              openIssueCount={workOsState.issues.filter((issue) => issue.status !== "done").length} nextFocus={nextFocus()}
            />

            <section class="rounded-xs border border-border bg-bg-secondary/70 p-4">
              <SectionHeader
                title="Projects"
                detail="Date ranges collect their to-dos and linked issues"
              />
              <form
                class="mt-3 grid min-w-0 gap-2 2xl:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_auto]"
                onSubmit={submitProject}
              >
                <input
                  class={INPUT_CLASS}
                  aria-label="Project name"
                  value={projectName()}
                  placeholder="Project name"
                  onInput={(event) => setProjectName(event.currentTarget.value)}
                />
                <input
                  class={INPUT_CLASS}
                  aria-label="Project start date"
                  type="date"
                  value={projectStartDate()}
                  onInput={(event) => setProjectStartDate(event.currentTarget.value)}
                />
                <input
                  class={INPUT_CLASS}
                  aria-label="Project end date"
                  type="date"
                  value={projectEndDate()}
                  onInput={(event) => setProjectEndDate(event.currentTarget.value)}
                />
                <button type="submit" class={BUTTON_CLASS}>
                  <PlusIcon size={14} />
                  <span>Create</span>
                </button>
              </form>
              <div class="mt-4 border-t border-border pt-3">
                <SectionHeader title="Project issues" detail="Decisions and blockers stay inside projects" />
                <form
                  class="mt-3 grid min-w-0 gap-2 2xl:grid-cols-[minmax(0,1fr)_10rem_8rem_auto]"
                  onSubmit={submitIssue}
                >
                  <input
                    class={INPUT_CLASS}
                    aria-label="Issue title"
                    value={issueTitle()}
                    placeholder="Add project issue"
                    onInput={(event) => setIssueTitle(event.currentTarget.value)}
                  />
                  <ProjectSelect
                    value={issueProjectId()}
                    onChange={setIssueProjectId}
                    label="Issue project"
                  />
                  <PrioritySelect value={issuePriority()} onChange={setIssuePriority} />
                  <button type="submit" class={BUTTON_CLASS} disabled={issueProjectId() === null}>
                    <PlusIcon size={14} />
                    <span>Add issue</span>
                  </button>
                </form>
              </div>
              <ProjectList projects={workOsState.projects} />
            </section>
        </section>
      </div>
    </main>
  );
}

export { TodayDashboard };
