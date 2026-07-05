import type { WorkProject } from "./work_os_store";

function projectIsScheduledOn(project: WorkProject, dateKey: string): boolean {
  return (
    project.status !== "done" &&
    project.startDate !== null &&
    project.endDate !== null &&
    project.startDate <= dateKey &&
    dateKey <= project.endDate
  );
}

export { projectIsScheduledOn };
