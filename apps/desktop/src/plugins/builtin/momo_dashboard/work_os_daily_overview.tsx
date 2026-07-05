import { DailySignal, SectionHeader } from "./work_os_dashboard_parts";

function DailyOverviewSection(props: {
  todayKey: string;
  scheduledTodayCount: number;
  inProgressCount: number;
  openIssueCount: number;
  nextFocus: string;
}) {
  return (
    <section class="rounded-xs border border-border bg-bg-secondary/70 p-4">
      <SectionHeader title="Daily" detail="A quick read before opening the tables" />
      <div class="mt-3 grid gap-2 md:grid-cols-3">
        <DailySignal label="Due today" value={props.scheduledTodayCount} detail={props.todayKey} />
        <DailySignal
          label="In progress"
          value={props.inProgressCount}
          detail="to-dos and issues"
        />
        <DailySignal
          label="Open issues"
          value={props.openIssueCount}
          detail="decisions and blockers"
        />
      </div>
      <div class="mt-3 rounded-xs border border-border bg-bg-primary px-3 py-2">
        <p class="text-[0.6875rem] font-semibold tracking-[0.12em] text-text-muted uppercase">
          Next focus
        </p>
        <p class="mt-1 truncate text-sm font-medium text-text-primary">{props.nextFocus}</p>
      </div>
    </section>
  );
}

export { DailyOverviewSection };
