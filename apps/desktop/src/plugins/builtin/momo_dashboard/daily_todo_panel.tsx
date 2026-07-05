import { DailyKanbanSection } from "./work_os_daily_kanban";
import { initWorkOsStore } from "./work_os_store";

function DailyTodoPanel() {
  initWorkOsStore();

  return (
    <div class="h-full overflow-y-auto bg-bg-primary p-3" data-momo-right-panel="daily-to-do">
      <DailyKanbanSection />
    </div>
  );
}

export { DailyTodoPanel };
