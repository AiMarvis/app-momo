import { IdeaSection } from "./work_os_calendar_ideas";
import { initWorkOsStore } from "./work_os_store";

function IdeasPanel() {
  initWorkOsStore();

  return (
    <div class="h-full overflow-y-auto bg-bg-primary p-3" data-momo-right-panel="ideas">
      <IdeaSection />
    </div>
  );
}

export { IdeasPanel };
