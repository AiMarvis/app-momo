import { renderToString } from "solid-js/web";
import { beforeEach, describe, expect, it, vi } from "vitest";

class StorageMock {
  readonly #store = new Map<string, string>();

  clear(): void {
    this.#store.clear();
  }

  getItem(key: string): string | null {
    return this.#store.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#store.set(key, value);
  }

  get length(): number {
    return this.#store.size;
  }
}

function installBrowserGlobals(): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      innerWidth: 1440,
      innerHeight: 900,
    },
  });

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new StorageMock(),
  });
}

describe("Momo dashboard shell", () => {
  beforeEach(() => {
    installBrowserGlobals();
    vi.resetModules();
    vi.doUnmock("~/plugins/slots");
    vi.doUnmock("~/stores/vault");
  });

  it("opens Today as a singleton center tab and preserves Search and Graph tabs", async () => {
    const navigation = await import("./navigation");
    const files = await import("~/stores/files");

    navigation.openMomoSurface("today");

    expect(files.getActiveTab()?.type).toBe("today");
    expect(files.filesState.tabs).toHaveLength(1);

    navigation.openMomoSurface("search");
    expect(files.getActiveTab()?.type).toBe("search");

    navigation.openMomoSurface("graph");
    expect(files.getActiveTab()?.type).toBe("graph");

    navigation.openMomoSurface("today");
    expect(files.getActiveTab()?.type).toBe("today");
    expect(files.filesState.tabs.filter((tab) => tab.type === "today")).toHaveLength(1);
  });

  it("opens Calendar from the right panel menu surface", async () => {
    const navigation = await import("./navigation");
    const layout = await import("~/stores/layout");

    navigation.openMomoSurface("calendar");

    expect(layout.layoutState.rightPanelOpen).toBe(true);
    expect(layout.layoutState.activeRightPanelViewId).toBe("momo-dashboard.calendar");
  });

  it("opens Daily to-do and Ideas as separate right panel menu surfaces", async () => {
    const navigation = await import("./navigation");
    const layout = await import("~/stores/layout");

    navigation.openMomoSurface("daily-to-do");
    expect(layout.layoutState.rightPanelOpen).toBe(true);
    expect(layout.layoutState.activeRightPanelViewId).toBe("momo-dashboard.daily-to-do");

    navigation.openMomoSurface("ideas");
    expect(layout.layoutState.rightPanelOpen).toBe(true);
    expect(layout.layoutState.activeRightPanelViewId).toBe("momo-dashboard.ideas");
  });

  it("uses a distinct sticky-note icon for Ideas instead of the chat icon", async () => {
    const { momoDashboardPlugin } = await import("./index");
    const ideasView = momoDashboardPlugin.views.find((view) => view.id === "momo-dashboard.ideas");

    expect(ideasView?.icon).toBe("sticky-note");
    expect(ideasView?.icon).not.toBe("message-square");
    expect(ideasView?.icon).not.toBe("momo-agent");
  });

  it("keeps AI Chat reachable from the operational nav without replacing center tabs", async () => {
    const navigation = await import("./navigation");
    const layout = await import("~/stores/layout");

    navigation.openMomoSurface("ai-chat");

    expect(layout.layoutState.rightPanelOpen).toBe(true);
    expect(layout.layoutState.activeRightPanelViewId).toBe("ai-chat.panel");
  });

  it("routes Inbox and Knowledge nav entries to live app surfaces without a vault", async () => {
    const navigation = await import("./navigation");
    const layout = await import("~/stores/layout");

    navigation.openMomoSurface("inbox");
    expect(layout.layoutState.rightPanelOpen).toBe(true);
    expect(layout.layoutState.activeRightPanelViewId).toBe("momo-dashboard.agent");

    navigation.openMomoSurface("knowledge");
    expect(layout.layoutState.activeRightPanelViewId).toBe("knowledge.panel");
  });

  it("falls back to the Knowledge folder when the Knowledge panel is unavailable", async () => {
    const selectedPaths: (string | null)[] = [];
    const toggledFolders: string[] = [];
    const fakeVaultState = {
      rootPath: "/tmp/momo-vault",
      files: [{ name: "Knowledge", path: "Knowledge", is_directory: true }],
      expandedFolders: new Set<string>(),
    };
    vi.doMock("~/plugins/slots", () => ({
      getRightPanelFill: () => undefined,
    }));
    vi.doMock("~/stores/vault", () => ({
      vaultState: fakeVaultState,
      findInTree: (entries: typeof fakeVaultState.files, targetPath: string) =>
        entries.find((entry) => entry.path === targetPath) ?? null,
      isFolderExpanded: (path: string) => fakeVaultState.expandedFolders.has(path),
      revealPath: vi.fn(),
      setSelectedPath: (path: string | null) => selectedPaths.push(path),
      toggleFolder: (path: string) => toggledFolders.push(path),
    }));
    const navigation = await import("./navigation");

    navigation.openMomoSurface("knowledge");

    expect(selectedPaths).toEqual(["Knowledge"]);
    expect(toggledFolders).toEqual(["Knowledge"]);
  });

  it("keeps operational nav buttons enabled without a vault", async () => {
    const { MomoOperationalNav } = await import("./momo_nav");

    const html = renderToString(() => <MomoOperationalNav />);

    expect(html).toContain("Inbox");
    expect(html).toContain("Knowledge");
    expect(html).not.toContain("Daily");
    expect(html).not.toContain("disabled");
  });

  it("renders Today as an independent Work OS dashboard", async () => {
    const { MOMO_OPERATION_ENTRIES } = await import("./navigation");
    const { CalendarPanel } = await import("./calendar_panel");
    const { DailyTodoPanel } = await import("./daily_todo_panel");
    const { IdeasPanel } = await import("./ideas_panel");
    const { TodayDashboard } = await import("./today_dashboard");

    const html = renderToString(() => <TodayDashboard />);
    const calendarHtml = renderToString(() => <CalendarPanel />);
    const dailyHtml = renderToString(() => <DailyTodoPanel />);
    const ideasHtml = renderToString(() => <IdeasPanel />);
    const labels = MOMO_OPERATION_ENTRIES.map((entry) => entry.label);

    expect(html).toContain("Today overview");
    expect(html).toContain("Daily to-dos, projects, calendar dates, issues, and ideas");
    expect(html).toContain("Daily");
    expect(html).toContain("Due today");
    expect(html).toContain("Next focus");
    expect(html).toContain("No daily focus yet");
    expect(html).toContain("Projects");
    expect(html).toContain("Project issues");
    expect(html).toContain("Project database");
    expect(html).toContain("Status / Folder / Sync / Work");
    expect(html).toContain("Status");
    expect(html).toContain("Project start date");
    expect(html).toContain("Project end date");
    expect(html).toContain("Issue project");
    expect(dailyHtml).toContain("Add to-do");
    expect(dailyHtml).toContain("Daily to-do");
    expect(dailyHtml).toContain("Kanban cards for today");
    expect(dailyHtml).toContain("Backlog");
    expect(dailyHtml).toContain("Todo");
    expect(dailyHtml).toContain("Doing");
    expect(dailyHtml).toContain("Done");
    expect(dailyHtml).toContain("No backlog");
    expect(dailyHtml).toContain("Work priority");
    expect(dailyHtml).toContain("To-do date");
    expect(dailyHtml).toContain("data-momo-right-panel=\"daily-to-do\"");
    expect(dailyHtml).toContain("data-momo-daily-kanban");
    expect(dailyHtml).not.toContain("Ideas");
    expect(dailyHtml).not.toContain("Daily to-dos and project ranges by date");
    expect(ideasHtml).toContain("Ideas");
    expect(ideasHtml).toContain("Moveable stickers for raw thoughts");
    expect(ideasHtml).toContain("Create sticker");
    expect(ideasHtml).toContain("No idea stickers yet");
    expect(ideasHtml).toContain("data-momo-right-panel=\"ideas\"");
    expect(ideasHtml).toContain("data-momo-idea-board");
    expect(ideasHtml).not.toContain("Daily to-do");
    expect(ideasHtml).not.toContain("Daily to-dos and project ranges by date");
    expect(calendarHtml).toContain("Calendar");
    expect(calendarHtml).toContain("Daily to-dos and project ranges by date");
    expect(calendarHtml).toContain("data-momo-right-panel=\"calendar\"");
    expect(calendarHtml).not.toContain("Kanban cards for today");
    expect(calendarHtml).not.toContain("Ideas");
    expect(html).not.toContain("Daily to-dos and project ranges by date");
    expect(html).not.toContain("Add to-do");
    expect(html).not.toContain("Create sticker");
    expect(html).not.toContain("Daily to-do list");
    expect(html).not.toContain("No scheduled work yet");
    expect(html).not.toContain("Start with your own Markdown files");
    expect(html).not.toContain("Markdown");
    expect(html).not.toContain("open a vault");
    expect(html).not.toContain("lecture followup with Minji");
    expect(html).not.toContain("Review lecture follow-ups");
    expect(html).not.toContain("Ship dashboard shell");
    expect(labels).toEqual([
      "Today",
      "Inbox",
      "Knowledge",
      "Search",
      "Graph",
      "AI Chat",
    ]);
  });

  it("renders Work OS properties as scannable rows", async () => {
    const store = await import("./work_os_store");
    const { CalendarPanel } = await import("./calendar_panel");
    const { DailyTodoPanel } = await import("./daily_todo_panel");
    const { IdeasPanel } = await import("./ideas_panel");
    const { TodayDashboard } = await import("./today_dashboard");

    const project = store.createWorkProject({
      name: "Momo desktop",
      startDate: "2026-07-05",
      endDate: "2026-07-07",
    });
    const task = store.createWorkTask({
      title: "Review calendar grouping",
      projectId: project.id,
      priority: "high",
      scheduleDate: "2026-07-05",
    });
    store.updateWorkTaskStatus(task.id, "doing");
    store.createWorkIssue({
      title: "Confirm project range",
      projectId: project.id,
      priority: "low",
      summary: "Launch planning needs one visible owner.",
      userOutcome: "The team knows who owns the project range before review.",
      nextAction: "Pick the owner during the next project check-in.",
      statusReason: "The issue is waiting for the project check-in.",
      priorityReason: "The range decision affects near-term planning.",
      technicalDetails: "Generated from project files only.",
      sourceEvidence: ["docs/project-range.md"],
    });
    store.createWorkIssue({
      title: "Unlinked blocker",
      projectId: project.id,
      priority: "medium",
    });
    store.linkWorkProjectFolder(project.id, {
      path: "/Users/momo/projects/momo-desktop",
      name: "momo-desktop",
    });
    store.recordProjectOsRunReceipt(project.id, {
      runId: "project-os-run-1",
      status: "applied",
      summary: "Found work that moves this project forward.",
      createdIssueIds: ["work-created"],
      updatedIssueIds: ["work-updated"],
      finishedAt: "2026-07-04T00:00:00.000Z",
    });
    store.createWorkIdea("Try sidebar sticky ideas");

    const html = renderToString(() => <TodayDashboard />);
    const calendarHtml = renderToString(() => <CalendarPanel />);
    const dailyHtml = renderToString(() => <DailyTodoPanel />);
    const ideasHtml = renderToString(() => <IdeasPanel />);

    expect(html).toContain("Momo desktop");
    expect(html).toContain("Review calendar grouping");
    expect(html).toContain("2026-07-05");
    expect(html).toContain("2026-07-07");
    expect(html).toContain("high");
    expect(html).toContain("doing");
    expect(html).toContain("ranges");
    expect(html).toContain("done");
    expect(html).toContain("1 open");
    expect(html).toContain("Confirm project range");
    expect(html).toContain("The team knows who owns the project range before review.");
    expect(html).toContain("Pick the owner during the next project check-in.");
    expect(html).toContain("Launch planning needs one visible owner.");
    expect(html).toContain("The issue is waiting for the project check-in.");
    expect(html).toContain("The range decision affects near-term planning.");
    expect(html).toContain("Technical details and source evidence");
    expect(html).toContain("Generated from project files only.");
    expect(html).toContain("docs/project-range.md");
    expect(html).toContain("momo-desktop");
    expect(html).toContain("/Users/momo/projects/momo-desktop");
    expect(html).toContain("Link Folder");
    expect(html).toContain("Analyze/Sync Project");
    expect(html).toContain("Auto Sync");
    expect(html).toContain("Latest sync found work that moves this project forward");
    expect(html).toContain("Found work that moves this project forward.");
    expect(html).toContain("Unlinked blocker");
    expect(dailyHtml).toContain("Review calendar grouping");
    expect(dailyHtml).toContain("Delete");
    expect(dailyHtml).not.toContain("Try sidebar sticky ideas");
    expect(ideasHtml).toContain("Try sidebar sticky ideas");
    expect(ideasHtml).toContain("Delete");
    expect(ideasHtml).not.toContain("Review calendar grouping");
    expect(calendarHtml).toContain("Review calendar grouping");
    expect(calendarHtml).not.toContain("Try sidebar sticky ideas");
  });

  it("does not render orphan issue rows in the project database", async () => {
    const store = await import("./work_os_store");
    const { TodayDashboard } = await import("./today_dashboard");

    store.createWorkIssue({
      title: "Give users a clear path after payment failure",
      projectId: null,
      priority: "high",
      summary: "Payment failures leave users unsure what to do next.",
      userOutcome: "Users can recover from a payment failure without support.",
      nextAction: "Add a recovery step to the payment failure screen.",
      technicalDetails: "Generated from a previous Project OS run.",
      sourceEvidence: ["docs/payments.md"],
    });

    const html = renderToString(() => <TodayDashboard />);

    expect(html).not.toContain("3 issue rows");
    expect(html).not.toContain("Give users a clear path after payment failure");
  });

  it("applies Project OS operations to three project issue rows", async () => {
    const store = await import("./work_os_store");
    const { applyProjectOsOperations } = await import("./project_os_analysis_runner");
    const project = store.createWorkProject({ name: "Project OS launch" });
    const existingIssue = store.createProjectOsIssue(project.id, {
      title: "Clarify pilot owners",
      summary: "The pilot owner is not visible.",
      userOutcome: "The team knows who owns the pilot.",
      nextAction: "Assign the pilot owner in the launch plan.",
      status: "todo",
      statusReason: "Owner selection has not started.",
      priority: "medium",
      priorityReason: "Ownership is needed before launch.",
      technicalDetails: "Existing issue seeded by the dashboard.",
      sourceEvidence: ["docs/pilot.md"],
    });
    expect(existingIssue).not.toBeNull();
    if (existingIssue === null) return;

    const result = applyProjectOsOperations(project.id, [
      {
        kind: "create_project_issue",
        projectId: project.id,
        issue: {
          kind: "project_issue",
          projectId: project.id,
          title: "Confirm launch checklist owner",
          summary: "The launch checklist needs one accountable owner.",
          userOutcome: "Reviewers know who will keep launch work moving.",
          nextAction: "Assign one checklist owner before the next review.",
          status: "todo",
          statusReason: "The owner is not assigned yet.",
          priority: "high",
          priorityReason: "Launch review depends on this owner.",
          sourceEvidence: ["docs/launch.md"],
          technicalDetails: "Create a Project OS issue from the linked folder scan.",
        },
      },
      {
        kind: "create_project_issue",
        projectId: project.id,
        issue: {
          kind: "project_issue",
          projectId: project.id,
          title: "Prepare stakeholder update",
          summary: "Stakeholders need a short project status update.",
          userOutcome: "Stakeholders can see what changed since the last review.",
          nextAction: "Draft the stakeholder update with decisions and blockers.",
          status: "backlog",
          statusReason: "The update is identified but not started.",
          priority: "medium",
          priorityReason: "The update helps coordination but is not blocking.",
          sourceEvidence: ["docs/status.md"],
          technicalDetails: "Create a Project OS issue from the linked folder scan.",
        },
      },
      {
        kind: "update_project_issue",
        projectId: project.id,
        issueId: existingIssue.id,
        update: {
          kind: "project_issue_update",
          projectId: project.id,
          issueId: existingIssue.id,
          status: "doing",
          statusReason: "Pilot owner selection is underway.",
          priority: "high",
          priorityReason: "The pilot cannot start without an owner.",
          sourceEvidence: ["docs/pilot.md"],
          technicalDetails: "Update only Project OS issue fields.",
        },
      },
    ]);

    expect(result).toEqual({
      kind: "applied",
      createdIssueIds: expect.any(Array),
      updatedIssueIds: [existingIssue.id],
    });
    expect(store.workOsState.issues.filter((issue) => issue.projectId === project.id)).toHaveLength(3);
    expect(store.workOsState.issues.map((issue) => issue.title)).toContain(
      "Confirm launch checklist owner",
    );
    expect(store.workOsState.issues.find((issue) => issue.id === existingIssue.id)?.status).toBe(
      "doing",
    );
  });

  it("runs Project OS analysis from the linked folder manifest without invoking the broad Codex agent", async () => {
    const invokeMock = vi.fn(async (command: string, args?: unknown) => {
      if (command === "project_os_scan_folder") {
        return {
          rootName: "customer-launch",
          files: [
            {
              path: "docs/payment-recovery.md",
              size: 120,
              snippet: "Payment failure recovery should explain the next checkout action.",
            },
            {
              path: "docs/onboarding-notes.md",
              size: 110,
              snippet: "Onboarding setup needs a clearer first-run next step.",
            },
            {
              path: "docs/support-handoff.md",
              size: 115,
              snippet: "Support handoff needs an owner for the first customer request.",
            },
          ],
          skipped: [],
          limits: { maxFiles: 80, maxBytes: 200000, bytesRead: 345, truncated: false },
        };
      }
      if (command === "agent_run_codex_chat") {
        throw new Error("Project OS must not invoke the broad Codex filesystem agent");
      }
      throw new Error(`Unexpected invoke command: ${command}; args=${JSON.stringify(args)}`);
    });
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
    const store = await import("./work_os_store");
    const { runProjectOsAnalysis } = await import("./project_os_analysis_runner");
    const project = store.createWorkProject({ name: "Customer launch" });
    store.linkWorkProjectFolder(project.id, {
      path: "/tmp/customer-launch",
      name: "customer-launch",
    });
    const linkedProject = store.workOsState.projects.find((item) => item.id === project.id);
    expect(linkedProject?.linkedFolder?.path).toBe("/tmp/customer-launch");
    if (!linkedProject) return;

    const result = await runProjectOsAnalysis(linkedProject);

    expect(result.kind).toBe("applied");
    expect(invokeMock).toHaveBeenCalledWith("project_os_scan_folder", {
      path: "/tmp/customer-launch",
    });
    expect(invokeMock).not.toHaveBeenCalledWith("agent_run_codex_chat", expect.anything());
    expect(store.workOsState.issues.map((issue) => issue.title)).toEqual(
      expect.arrayContaining([
        "Give users a clear path after payment failure",
        "Make the first setup step clearly actionable",
        "Assign the first support response clearly",
      ]),
    );
    expect(store.workOsState.issues.length).toBeGreaterThanOrEqual(3);
    expect(store.workOsState.issues.every((issue) => issue.projectId === project.id)).toBe(true);
  });

  it("creates Project OS issues in the configured default issue language", async () => {
    localStorage.setItem("settings-cache", JSON.stringify({ projectIssueLanguage: "ko" }));
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: vi.fn(async (command: string, args?: unknown) => {
        if (command === "project_os_scan_folder") {
          return {
            rootName: "customer-launch",
            files: [
              {
                path: "docs/payment-recovery.md",
                size: 120,
                snippet: "Payment failure recovery should explain the next checkout action.",
              },
              {
                path: "docs/onboarding-notes.md",
                size: 110,
                snippet: "Onboarding setup needs a clearer first-run next step.",
              },
              {
                path: "docs/support-handoff.md",
                size: 115,
                snippet: "Support handoff needs an owner for the first customer request.",
              },
            ],
            skipped: [],
            limits: { maxFiles: 80, maxBytes: 200000, bytesRead: 345, truncated: false },
          };
        }
        throw new Error(`Unexpected invoke command: ${command}; args=${JSON.stringify(args)}`);
      }),
    }));

    const store = await import("./work_os_store");
    const { runProjectOsAnalysis } = await import("./project_os_analysis_runner");
    const project = store.createWorkProject({ name: "Customer launch" });
    store.linkWorkProjectFolder(project.id, {
      path: "/tmp/customer-launch",
      name: "customer-launch",
    });
    const linkedProject = store.workOsState.projects.find((item) => item.id === project.id);
    if (!linkedProject) return;

    const result = await runProjectOsAnalysis(linkedProject);

    expect(result.kind).toBe("applied");
    expect(store.workOsState.issues.map((issue) => issue.title)).toEqual(
      expect.arrayContaining([
        "결제 실패 후 사용자가 다시 진행할 방법 보여주기",
        "첫 설정 단계에서 다음 행동을 분명하게 보여주기",
        "첫 고객 응답 담당자를 명확히 정하기",
      ]),
    );
    expect(store.workOsState.issues.every((issue) => issue.projectId === project.id)).toBe(true);
  });

  it("shows a reachable choose-one agent state for no or unsupported Inbox selection", async () => {
    const { agentPanelCopyForState } = await import("./agent_panel");

    expect(agentPanelCopyForState({ kind: "empty" })).toEqual({
      title: "Choose one Inbox note",
      detail: "Select exactly one source note under Inbox",
    });
    expect(agentPanelCopyForState({ kind: "batch_unavailable", count: 2 })).toEqual({
      title: "Choose one Inbox note",
      detail: "Select exactly one source note under Inbox",
    });
  });
});
