// @allow SIZE_OK - legacy Work OS persistence regression suite; this change only adds Project OS Git receipt coverage.
import { beforeEach, describe, expect, it, vi } from "vitest";

class StorageMock {
  readonly #store = new Map<string, string>();

  clear(): void {
    this.#store.clear();
  }

  getItem(key: string): string | null {
    return this.#store.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.#store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#store.set(key, value);
  }
}

function installBrowserGlobals(): void {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new StorageMock(),
  });
}

async function loadStore() {
  vi.resetModules();
  return import("./work_os_store");
}

describe("Work OS store", () => {
  beforeEach(() => {
    installBrowserGlobals();
  });

  it("creates projects and tasks independently from vault files", async () => {
    const store = await loadStore();

    const project = store.createWorkProject({
      name: "Desktop app",
      startDate: "2026-07-03",
      endDate: "2026-07-05",
    });
    const task = store.createWorkTask({
      title: "Triage today's work",
      projectId: project.id,
      priority: "high",
      scheduleDate: "2026-07-02",
    });

    store.updateWorkTaskStatus(task.id, "doing");
    store.updateWorkTaskPriority(task.id, "low");
    store.updateWorkProjectStatus(project.id, "paused");

    expect(store.workOsState.projects).toMatchObject([
      {
        id: project.id,
        name: "Desktop app",
        startDate: "2026-07-03",
        endDate: "2026-07-05",
        status: "paused",
      },
    ]);
    expect(store.workOsState.tasks).toMatchObject([
      {
        id: task.id,
        title: "Triage today's work",
        projectId: project.id,
        priority: "low",
        scheduleDate: "2026-07-02",
        status: "doing",
      },
    ]);
  });

  it("loads persisted work without sample data", async () => {
    const first = await loadStore();

    const project = first.createWorkProject({ name: "Momo" });
    first.createWorkTask({
      title: "Prepare dashboard",
      projectId: project.id,
      priority: "medium",
      scheduleDate: "2026-07-04",
    });
    const idea = first.createWorkIdea("Try sticky ideas");

    const second = await loadStore();
    second.initWorkOsStore();

    expect(second.workOsState.projects).toHaveLength(1);
    expect(second.workOsState.projects[0]?.name).toBe("Momo");
    expect(second.workOsState.projects[0]?.startDate).toBeNull();
    expect(second.workOsState.projects[0]?.endDate).toBeNull();
    expect(second.workOsState.tasks).toHaveLength(1);
    expect(second.workOsState.tasks[0]?.title).toBe("Prepare dashboard");
    expect(second.workOsState.tasks[0]?.scheduleDate).toBe("2026-07-04");
    expect(second.workOsState.ideas).toMatchObject([{ id: idea.id, text: "Try sticky ideas" }]);
  });

  it("persists linked folders, manual sync state, auto sync, and Project OS receipts", async () => {
    const first = await loadStore();

    const project = first.createWorkProject({ name: "Project OS" });
    first.linkWorkProjectFolder(project.id, {
      path: "/tmp/momo-project",
      name: "momo-project",
      linkedAt: "2026-07-04T01:00:00.000Z",
    });
    first.updateWorkProjectManualSync(project.id, {
      status: "running",
      startedAt: "2026-07-04T01:01:00.000Z",
      finishedAt: null,
      error: "",
    });
    first.toggleWorkProjectAutoSync(project.id, true);
    first.recordProjectOsRunReceipt(project.id, {
      runId: "run-1",
      status: "applied",
      summary: "Created readable project work",
      createdIssueIds: ["work-new"],
      updatedIssueIds: ["work-existing"],
      finishedAt: "2026-07-04T01:02:00.000Z",
      git: {
        status: "summarized",
        headCommit: "abc1234",
        previousCommit: "def5678",
        range: "def5678..abc1234",
        summary: "결제 복구 안내와 온보딩 문구 변경이 프로젝트 증거로 포함되었습니다.",
        changedPaths: ["docs/payment-recovery.md", "src/onboarding/checklist.tsx"],
        error: "",
      },
    });

    const second = await loadStore();
    second.initWorkOsStore();

    expect(second.workOsState.projects).toMatchObject([
      {
        id: project.id,
        linkedFolder: {
          path: "/tmp/momo-project",
          name: "momo-project",
          linkedAt: "2026-07-04T01:00:00.000Z",
        },
        manualSync: {
          status: "running",
          startedAt: "2026-07-04T01:01:00.000Z",
          finishedAt: null,
          error: "",
        },
        autoSyncEnabled: true,
        lastProjectOsRunReceipt: {
          runId: "run-1",
          status: "applied",
          summary: "Created readable project work",
          createdIssueIds: ["work-new"],
          updatedIssueIds: ["work-existing"],
          finishedAt: "2026-07-04T01:02:00.000Z",
          git: {
            status: "summarized",
            headCommit: "abc1234",
            previousCommit: "def5678",
            range: "def5678..abc1234",
            summary: "결제 복구 안내와 온보딩 문구 변경이 프로젝트 증거로 포함되었습니다.",
            changedPaths: ["docs/payment-recovery.md", "src/onboarding/checklist.tsx"],
            error: "",
          },
        },
      },
    ]);
  });

  it("normalizes old Project OS receipts without Git evidence to null Git receipt", async () => {
    localStorage.setItem(
      "momo-work-os-v1",
      JSON.stringify({
        tasks: [],
        issues: [],
        projects: [
          {
            id: "project-legacy-receipt",
            name: "Legacy receipt",
            status: "active",
            createdAt: "2026-07-01T00:00:00.000Z",
            lastProjectOsRunReceipt: {
              runId: "run-legacy",
              status: "applied",
              summary: "Created readable project work",
              createdIssueIds: ["work-new"],
              updatedIssueIds: [],
              finishedAt: "2026-07-04T01:02:00.000Z",
            },
          },
        ],
        ideas: [],
      }),
    );

    const store = await loadStore();
    store.initWorkOsStore();

    expect(store.workOsState.projects[0]?.lastProjectOsRunReceipt).toMatchObject({
      runId: "run-legacy",
      git: null,
    });
  });

  it("drops unsafe paths from persisted Project OS Git receipts", async () => {
    localStorage.setItem(
      "momo-work-os-v1",
      JSON.stringify({
        tasks: [],
        issues: [],
        projects: [
          {
            id: "project-unsafe-git-receipt",
            name: "Unsafe receipt",
            status: "active",
            createdAt: "2026-07-01T00:00:00.000Z",
            lastProjectOsRunReceipt: {
              runId: "run-unsafe-git",
              status: "applied",
              summary: "Created readable project work",
              createdIssueIds: ["work-new"],
              updatedIssueIds: [],
              finishedAt: "2026-07-04T01:02:00.000Z",
              git: {
                status: "summarized",
                headCommit: "abc1234",
                previousCommit: "def5678",
                range: "def5678..abc1234",
                summary: "Git receipt restored from storage.",
                changedPaths: [
                  "docs/payment-recovery.md",
                  "/Inbox/private.md",
                  "../outside.md",
                  "Knowledge/notes.md",
                  "Tasks/private.md",
	                  "Organize Inbox/incoming.md",
	                  "docs/Knowledge/notes.md",
	                  ".env",
                  "config/app.pem",
                  "docs/private-plan.md",
                  "src/api_token.ts",
                ],
                error: "",
              },
            },
          },
        ],
        ideas: [],
      }),
    );

    const store = await loadStore();
    store.initWorkOsStore();

    expect(store.workOsState.projects[0]?.lastProjectOsRunReceipt?.git).toMatchObject({
      status: "summarized",
      changedPaths: ["docs/payment-recovery.md"],
      error: "10 unsafe Git receipt path(s) were ignored.",
    });
  });

  it("persists Project OS issue fields for non-developer readers", async () => {
    const first = await loadStore();

    const project = first.createWorkProject({ name: "Readable issues" });
    const issue = first.createProjectOsIssue(project.id, {
      title: "Make sign-up progress obvious",
      summary: "The onboarding screen does not tell users how far they are.",
      userOutcome: "New users know what remains before setup is complete.",
      nextAction: "Add a short progress label above the setup checklist.",
      status: "backlog",
      statusReason: "Ready to plan after the current release.",
      priority: "high",
      priorityReason: "It affects every new account.",
      technicalDetails: "The setup checklist currently renders without a completion summary.",
      sourceEvidence: ["docs/onboarding.md", "src/onboarding/checklist.ts"],
    });

    const second = await loadStore();
    second.initWorkOsStore();

    expect(second.workOsState.issues).toMatchObject([
      {
        id: issue?.id,
        projectId: project.id,
        title: "Make sign-up progress obvious",
        summary: "The onboarding screen does not tell users how far they are.",
        userOutcome: "New users know what remains before setup is complete.",
        nextAction: "Add a short progress label above the setup checklist.",
        status: "backlog",
        statusReason: "Ready to plan after the current release.",
        priority: "high",
        priorityReason: "It affects every new account.",
        technicalDetails: "The setup checklist currently renders without a completion summary.",
        sourceEvidence: ["docs/onboarding.md", "src/onboarding/checklist.ts"],
      },
    ]);
  });

  it("creates and updates Project OS issues only inside the requested project", async () => {
    const store = await loadStore();

    const sourceProject = store.createWorkProject({ name: "Source project" });
    const otherProject = store.createWorkProject({ name: "Other project" });
    const created = store.createProjectOsIssue(sourceProject.id, {
      title: "Explain billing setup",
      summary: "Billing setup needs clearer wording.",
      nextAction: "Rewrite the first billing step.",
      priority: "medium",
    });
    if (!created) throw new Error("expected Project OS issue");

    store.updateProjectOsIssue(otherProject.id, created.id, {
      title: "Wrong project edit",
      nextAction: "This should not apply.",
    });
    store.updateProjectOsIssue(sourceProject.id, created.id, {
      title: "Explain billing setup clearly",
      nextAction: "Replace the first billing step with plain language.",
      priority: "high",
      sourceEvidence: ["docs/billing.md"],
    });

    const missingProjectIssue = store.createProjectOsIssue("project-missing", {
      title: "Do not create this",
      priority: "low",
    });

    expect(missingProjectIssue).toBeNull();
    expect(store.workOsState.issues).toMatchObject([
      {
        id: created.id,
        projectId: sourceProject.id,
        title: "Explain billing setup clearly",
        nextAction: "Replace the first billing step with plain language.",
        priority: "high",
        sourceEvidence: ["docs/billing.md"],
      },
    ]);
  });

  it("normalizes old snapshots without Project OS project or issue fields", async () => {
    localStorage.setItem(
      "momo-work-os-v1",
      JSON.stringify({
        tasks: [],
        issues: [
          {
            id: "work-issue-1",
            title: "Legacy issue",
            projectId: "project-1",
            status: "doing",
            priority: "medium",
            createdAt: "2026-07-01T00:00:00.000Z",
          },
        ],
        projects: [
          {
            id: "project-1",
            name: "Legacy project",
            status: "active",
            createdAt: "2026-07-01T00:00:00.000Z",
          },
        ],
        ideas: [],
      }),
    );

    const store = await loadStore();
    store.initWorkOsStore();

    expect(store.workOsState.projects).toMatchObject([
      {
        id: "project-1",
        linkedFolder: null,
        manualSync: {
          status: "idle",
          startedAt: null,
          finishedAt: null,
          error: "",
        },
        autoSyncEnabled: false,
        lastProjectOsRunReceipt: null,
      },
    ]);
    expect(store.workOsState.issues).toMatchObject([
      {
        id: "work-issue-1",
        summary: "",
        userOutcome: "",
        nextAction: "",
        statusReason: "",
        priorityReason: "",
        technicalDetails: "",
        sourceEvidence: [],
      },
    ]);
  });

  it("removes persisted orphan issue rows when their project is gone", async () => {
    localStorage.setItem(
      "momo-work-os-v1",
      JSON.stringify({
        tasks: [],
        issues: [
          {
            id: "work-orphan-project-os",
            title: "Give users a clear path after payment failure",
            projectId: null,
            status: "todo",
            priority: "high",
            summary: "Payment failures leave users unsure what to do next.",
            userOutcome: "Users can recover from a payment failure without support.",
            nextAction: "Add a plain-language recovery step to the payment failure screen.",
            technicalDetails: "Found in payment recovery notes.",
            sourceEvidence: ["docs/payments.md"],
            createdAt: "2026-07-01T00:00:00.000Z",
          },
          {
            id: "work-orphan-legacy",
            title: "Assign the first support response clearly",
            projectId: null,
            status: "todo",
            priority: "medium",
            createdAt: "2026-07-01T00:00:00.000Z",
          },
        ],
        projects: [],
        ideas: [],
      }),
    );

    const store = await loadStore();
    store.initWorkOsStore();

    expect(store.workOsState.issues).toHaveLength(0);
    expect(localStorage.getItem("momo-work-os-v1")).not.toContain("work-orphan-project-os");
    expect(localStorage.getItem("momo-work-os-v1")).not.toContain("work-orphan-legacy");
  });

  it("persists daily to-do card edits, status, and color", async () => {
    const first = await loadStore();

    const task = first.createWorkTask({
      title: "Plan release note",
      description: "Explain what changed in user-facing language",
      projectId: null,
      priority: "medium",
      status: "backlog",
      color: "blue",
      scheduleDate: "2026-07-08",
    });

    first.updateWorkTaskTitle(task.id, "출시 안내 문구 확인");
    first.updateWorkTaskDescription(task.id, "고객이 바로 이해할 수 있는 표현으로 정리");
    first.updateWorkTaskStatus(task.id, "doing");
    first.updateWorkTaskColor(task.id, "rose");

    const second = await loadStore();
    second.initWorkOsStore();

    expect(second.workOsState.tasks).toMatchObject([
      {
        id: task.id,
        title: "출시 안내 문구 확인",
        description: "고객이 바로 이해할 수 있는 표현으로 정리",
        status: "doing",
        color: "rose",
        scheduleDate: "2026-07-08",
      },
    ]);

    second.deleteWorkTask(task.id);
    const third = await loadStore();
    third.initWorkOsStore();

    expect(third.workOsState.tasks).toHaveLength(0);
  });

  it("persists idea sticker edits, position, and color", async () => {
    const first = await loadStore();

    const idea = first.createWorkIdea({
      text: "첫 화면에서 다음 행동을 더 분명하게",
      color: "yellow",
      x: 18,
      y: 24,
    });

    first.updateWorkIdeaText(idea.id, "첫 화면 CTA 문구를 더 짧게");
    first.updateWorkIdeaColor(idea.id, "green");
    first.updateWorkIdeaPosition(idea.id, 62, 41);

    const second = await loadStore();
    second.initWorkOsStore();

    expect(second.workOsState.ideas).toMatchObject([
      {
        id: idea.id,
        text: "첫 화면 CTA 문구를 더 짧게",
        color: "green",
        x: 62,
        y: 41,
      },
    ]);

    second.deleteWorkIdea(idea.id);
    const third = await loadStore();
    third.initWorkOsStore();

    expect(third.workOsState.ideas).toHaveLength(0);
  });

  it("normalizes invalid persisted dates, migrates project scheduleDate, and deletes ideas", async () => {
    localStorage.setItem(
      "momo-work-os-v1",
      JSON.stringify({
        tasks: [
          {
            id: "work-1",
            title: "Invalid task date",
            projectId: null,
            status: "todo",
            priority: "medium",
            scheduleDate: "tomorrow",
            createdAt: "2026-07-01T00:00:00.000Z",
          },
        ],
        issues: [],
        projects: [
          {
            id: "project-1",
            name: "Legacy project date",
            status: "active",
            scheduleDate: "2026-07-05",
            createdAt: "2026-07-01T00:00:00.000Z",
          },
          {
            id: "project-2",
            name: "Invalid project date",
            status: "active",
            startDate: "2026/07/06",
            endDate: "later",
            createdAt: "2026-07-01T00:00:00.000Z",
          },
        ],
        ideas: [],
      }),
    );

    const store = await loadStore();
    store.initWorkOsStore();
    const idea = store.createWorkIdea("Delete me");
    store.deleteWorkIdea(idea.id);

    expect(store.workOsState.tasks[0]?.scheduleDate).toBeNull();
    expect(store.workOsState.projects[0]?.startDate).toBe("2026-07-05");
    expect(store.workOsState.projects[0]?.endDate).toBe("2026-07-05");
    expect(store.workOsState.projects[1]?.startDate).toBeNull();
    expect(store.workOsState.projects[1]?.endDate).toBeNull();
    expect(store.workOsState.ideas).toHaveLength(0);
  });

  it("deletes a task without touching related project or issue rows", async () => {
    const store = await loadStore();

    const project = store.createWorkProject({ name: "Delete task project" });
    const task = store.createWorkTask({
      title: "Delete only this to-do",
      projectId: project.id,
      priority: "medium",
      scheduleDate: "2026-07-06",
    });
    const issue = store.createWorkIssue({
      title: "Keep linked issue",
      projectId: project.id,
      priority: "high",
    });

    store.deleteWorkTask(task.id);

    expect(store.workOsState.tasks).toHaveLength(0);
    expect(store.workOsState.projects).toMatchObject([{ id: project.id }]);
    expect(store.workOsState.issues).toMatchObject([{ id: issue.id, projectId: project.id }]);
  });

  it("deletes a project by unlinking related tasks and removing related issues", async () => {
    const store = await loadStore();

    const project = store.createWorkProject({ name: "Archive project" });
    const task = store.createWorkTask({
      title: "Keep to-do",
      projectId: project.id,
      priority: "medium",
      scheduleDate: "2026-07-07",
    });
    const issue = store.createWorkIssue({
      title: "Keep issue",
      projectId: project.id,
      priority: "low",
    });
    const projectOsIssue = store.createProjectOsIssue(project.id, {
      title: "Clarify customer handoff",
      summary: "The handoff needs a visible owner.",
      nextAction: "Pick the first response owner.",
      priority: "medium",
    });
    if (!projectOsIssue) throw new Error("expected Project OS issue");

    store.deleteWorkProject(project.id);

    expect(store.workOsState.projects).toHaveLength(0);
    expect(store.workOsState.tasks).toMatchObject([{ id: task.id, projectId: null }]);
    expect(store.workOsState.issues).toHaveLength(0);
    expect(store.workOsState.issues.map((item) => item.id)).not.toContain(issue.id);
    expect(store.workOsState.issues.map((item) => item.id)).not.toContain(projectOsIssue.id);
  });
});
