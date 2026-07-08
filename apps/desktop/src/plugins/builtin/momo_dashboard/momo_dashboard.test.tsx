// @allow SIZE_OK - legacy dashboard integration suite; this change only covers Project OS Git receipt and issue rendering.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

type AgentProviderFixture = "codex_cli" | "nvidia";

function aiChatSettings(provider: AgentProviderFixture = "codex_cli"): Record<string, unknown> {
  if (provider === "nvidia") {
    return {
      provider: "remote",
      apiKey: null,
      model: "gemini-3.1-flash-lite",
      serverUrl: "http://localhost:8080",
      codexModel: "",
      codexSandbox: "read-only",
      agentApiProvider: "nvidia",
      agentApiBaseUrl: "https://integrate.api.nvidia.com/v1",
      agentApiModel: "nvidia/nemotron-3-ultra-550b-a55b",
      agentApiName: "NVIDIA NIM",
      roundLimit: 12,
      proxyToolTimeoutMs: 15_000,
    };
  }
  return {
    provider: "remote",
    apiKey: null,
    model: "gemini-3.1-flash-lite",
    serverUrl: "http://localhost:8080",
    codexModel: "gpt-5-codex",
    codexSandbox: "read-only",
    agentApiProvider: "codex_cli",
    agentApiBaseUrl: "",
    agentApiModel: "",
    agentApiName: "Codex CLI",
    roundLimit: 12,
    proxyToolTimeoutMs: 15_000,
  };
}

function projectAnalysisResponse(
  projectId: string,
  title: string,
  sourceEvidence: string,
): { readonly content: string } {
  return {
    content: JSON.stringify({
      kind: "project_analysis",
      projectId,
      summary: `${title} is ready to become Project OS work.`,
      creates: [
        {
          kind: "project_issue",
          projectId,
          title,
          summary: "The linked project evidence points to a concrete owner decision.",
          userOutcome:
            "Project owners can decide the next user-facing action without reading raw files.",
          nextAction: "Assign the owner and write the first checkpoint for the project team.",
          status: "todo",
          statusReason: "The next coordination step is visible from the bounded evidence.",
          priority: "high",
          priorityReason: "The issue affects the next project handoff.",
          sourceEvidence: [sourceEvidence],
          technicalDetails: "Created from the Project OS analysis prompt evidence.",
        },
      ],
      updates: [],
    }),
  };
}

function projectIdFromRequestArgs(args: unknown): string {
  const match = /project-[a-z0-9-]+/i.exec(JSON.stringify(args));
  if (match) return match[0];
  throw new Error("Expected Project OS prompt to include the project id.");
}

function projectScan(files: readonly { readonly path: string; readonly snippet: string }[]): {
  readonly rootName: string;
  readonly files: readonly {
    readonly path: string;
    readonly size: number;
    readonly snippet: string;
  }[];
  readonly skipped: readonly string[];
  readonly limits: {
    readonly maxFiles: number;
    readonly maxBytes: number;
    readonly bytesRead: number;
    readonly truncated: boolean;
  };
} {
  return {
    rootName: "linked-project",
    files: files.map((file) => ({
      path: file.path,
      size: file.snippet.length,
      snippet: file.snippet,
    })),
    skipped: [],
    limits: { maxFiles: 80, maxBytes: 200000, bytesRead: 120, truncated: false },
  };
}

function notGitSummary(): Record<string, unknown> {
  return {
    status: "notGit",
    head: null,
    previousCommit: null,
    range: null,
    changedPaths: [],
    statusShort: [],
    diffNameStatus: [],
    diffStat: [],
    logOneline: [],
    message: "Folder is not a Git repository root.",
  };
}

function readyGitSummary(
  path: string,
  previousCommit: string | null = null,
): Record<string, unknown> {
  return {
    status: "ready",
    head: "abcdef1234567890abcdef1234567890abcdef12",
    previousCommit,
    range: previousCommit ? `${previousCommit}..HEAD` : "HEAD",
    changedPaths: [path],
    statusShort: [` M ${path}`],
    diffNameStatus: [`M\t${path}`],
    diffStat: [`${path} | 4 ++++`],
    logOneline: ["abcdef1 prepare release readiness"],
    message: null,
  };
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
    expect(html).toContain("Status / Folder / Sync / Issues");
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
    expect(dailyHtml).toContain('data-momo-right-panel="daily-to-do"');
    expect(dailyHtml).toContain("data-momo-daily-kanban");
    expect(dailyHtml).not.toContain("Ideas");
    expect(dailyHtml).not.toContain("Daily to-dos and project ranges by date");
    expect(ideasHtml).toContain("Ideas");
    expect(ideasHtml).toContain("Moveable stickers for raw thoughts");
    expect(ideasHtml).toContain("Create sticker");
    expect(ideasHtml).toContain("No idea stickers yet");
    expect(ideasHtml).toContain('data-momo-right-panel="ideas"');
    expect(ideasHtml).toContain("data-momo-idea-board");
    expect(ideasHtml).not.toContain("Daily to-do");
    expect(ideasHtml).not.toContain("Daily to-dos and project ranges by date");
    expect(calendarHtml).toContain("Calendar");
    expect(calendarHtml).toContain("Daily to-dos and project ranges by date");
    expect(calendarHtml).toContain('data-momo-right-panel="calendar"');
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
    expect(labels).toEqual(["Today", "Inbox", "Knowledge", "Search", "Graph", "AI Chat"]);
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
    expect(html).toContain("In progress");
    expect(html).toContain("Open issues");
    expect(html).toContain("ranges");
    expect(html).toContain("done");
    expect(html).toContain("2 issues");
    expect(html).toContain("Open Project OS issues for Momo desktop");
    expect(html).not.toContain("Confirm project range");
    expect(html).not.toContain("The team knows who owns the project range before review.");
    expect(html).not.toContain("Pick the owner during the next project check-in.");
    expect(html).not.toContain("Launch planning needs one visible owner.");
    expect(html).not.toContain("The issue is waiting for the project check-in.");
    expect(html).not.toContain("The range decision affects near-term planning.");
    expect(html).not.toContain("Technical details and source evidence");
    expect(html).not.toContain("Generated from project files only.");
    expect(html).not.toContain("docs/project-range.md");
    expect(html).toContain("momo-desktop");
    expect(html).toContain("/Users/momo/projects/momo-desktop");
    expect(html).toContain("Link Folder");
    expect(html).toContain("Analyze/Sync Project");
    expect(html).toContain("Auto Sync");
    expect(html).toContain("Latest sync found work that moves this project forward");
    expect(html).toContain("Found work that moves this project forward.");
    expect(html).not.toContain("Unlinked blocker");
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

  it("renders compact Project OS Git receipt summary with collapsed technical details", async () => {
    const store = await import("./work_os_store");
    const { TodayDashboard } = await import("./today_dashboard");
    const project = store.createWorkProject({ name: "Git-aware Project OS" });
    store.linkWorkProjectFolder(project.id, {
      path: "/Users/momo/projects/git-aware",
      name: "git-aware",
    });
    store.createProjectOsIssue(project.id, {
      title: "사용자가 새 버전을 안전하게 업데이트할 수 있게 하기",
      summary: "업데이트 안내와 검증 흐름이 릴리스 준비 과정에 포함되어야 합니다.",
      userOutcome: "사용자가 새 버전을 설치할 때 무엇이 바뀌는지 알고 안전하게 진행합니다.",
      nextAction: "릴리스 체크리스트에 업데이트 전후 확인 항목을 정리합니다.",
      status: "todo",
      statusReason: "릴리스 검증 항목이 아직 대시보드에서 관리되지 않습니다.",
      priority: "high",
      priorityReason: "v0.6.0 배포 전에 사용자가 업데이트 흐름을 신뢰할 수 있어야 합니다.",
      sourceEvidence: ["docs/release-checklist.md"],
      technicalDetails: "Git range 123456a..abcdef1에서 release checklist 변경이 감지되었습니다.",
    });
    store.createProjectOsIssue(project.id, {
      title: "결제 실패 후 사용자가 다시 진행할 방법 보여주기",
      summary: "결제 복구 안내가 바뀌었지만 다음 행동이 제품 이슈로 추적되지 않았습니다.",
      userOutcome: "결제 실패 사용자가 지원 요청 없이 다시 결제를 시도할 수 있습니다.",
      nextAction: "결제 실패 화면의 복구 안내와 재시도 동선을 검증합니다.",
      status: "doing",
      statusReason: "복구 안내 변경을 릴리스 전에 확인하는 중입니다.",
      priority: "high",
      priorityReason: "결제 실패는 사용자 이탈로 바로 이어질 수 있습니다.",
      sourceEvidence: ["docs/payment-recovery.md"],
      technicalDetails: "Git diff evidence: docs/payment-recovery.md | 3 +++",
    });
    store.createProjectOsIssue(project.id, {
      title: "첫 설정 단계에서 다음 행동을 분명하게 보여주기",
      summary: "온보딩 체크리스트 변경이 초기 설정 경험의 다음 행동과 연결되어야 합니다.",
      userOutcome: "처음 온 사용자가 설정을 멈추지 않고 다음 단계를 이해합니다.",
      nextAction: "온보딩 체크리스트의 빈 상태와 완료 상태 문구를 확인합니다.",
      status: "todo",
      statusReason: "체크리스트 변경은 감지됐지만 사용자 흐름 확인이 남아 있습니다.",
      priority: "medium",
      priorityReason: "첫 설정 성공률은 릴리스 품질에 직접 연결됩니다.",
      sourceEvidence: ["src/onboarding/checklist.tsx"],
      technicalDetails:
        "Git diff evidence: src/onboarding/checklist.tsx changed in abcdef1234567890",
    });
    store.recordProjectOsRunReceipt(project.id, {
      runId: "project-os-run-git",
      status: "applied",
      summary: "Found work that moves this project forward.",
      createdIssueIds: ["work-created"],
      updatedIssueIds: ["work-updated"],
      finishedAt: "2026-07-04T00:00:00.000Z",
      git: {
        status: "summarized",
        headCommit: "abcdef1234567890",
        previousCommit: "123456abcdef7890",
        range: "123456a..abcdef1",
        summary:
          "긴급 결제 복구 안내와 온보딩 체크리스트 변경이 이번 프로젝트 분석 증거로 함께 포함되었습니다.",
        changedPaths: ["docs/payment-recovery.md", "src/onboarding/checklist.tsx"],
        error: "",
      },
    });

    const html = renderToString(() => <TodayDashboard />);
    if (process.env.MOMO_PROJECT_OS_VISUAL_EVIDENCE === "1") {
      const evidencePath = fileURLToPath(
        new URL(
          "../../../../../../.omo/evidence/project-os-git-aware/03-dashboard-render.html",
          import.meta.url,
        ),
      );
      await mkdir(dirname(evidencePath), { recursive: true });
      await writeFile(evidencePath, html, "utf8");
    }

    expect(html).toContain("Git changes were included as evidence");
    expect(html).toContain(
      "긴급 결제 복구 안내와 온보딩 체크리스트 변경이 이번 프로젝트 분석 증거로 함께 포함되었습니다.",
    );
    expect(html).toContain("Git receipt details");
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("123456a..abcdef1");
    expect(html).toContain("docs/payment-recovery.md");
    expect(html).toContain("src/onboarding/checklist.tsx");
    expect(html).toContain("3 issues");
    expect(html).toContain("Open Project OS issues for Git-aware Project OS");
    expect(html).not.toContain("사용자가 새 버전을 안전하게 업데이트할 수 있게 하기");
    expect(html).not.toContain("결제 실패 후 사용자가 다시 진행할 방법 보여주기");
    expect(html).not.toContain("첫 설정 단계에서 다음 행동을 분명하게 보여주기");
    expect(html).not.toContain("Technical details and source evidence");
  });

  it("does not render secret-looking paths restored from Project OS Git receipts", async () => {
    localStorage.setItem(
      "momo-work-os-v1",
      JSON.stringify({
        tasks: [],
        issues: [],
        projects: [
          {
            id: "project-secret-git-receipt",
            name: "Secret receipt project",
            status: "active",
            createdAt: "2026-07-04T00:00:00.000Z",
            linkedFolder: {
              path: "/Users/momo/projects/secret-receipt",
              name: "secret-receipt",
              linkedAt: "2026-07-04T00:00:00.000Z",
            },
            manualSync: {
              status: "succeeded",
              startedAt: "2026-07-04T00:00:00.000Z",
              finishedAt: "2026-07-04T00:01:00.000Z",
              error: "",
            },
            autoSyncEnabled: false,
            lastProjectOsRunReceipt: {
              runId: "project-os-run-secret-paths",
              status: "applied",
              summary: "Restored Git receipt.",
              createdIssueIds: [],
              updatedIssueIds: [],
              finishedAt: "2026-07-04T00:01:00.000Z",
              git: {
                status: "summarized",
                headCommit: "abcdef1234567890",
                previousCommit: "",
                range: "HEAD",
                summary: "Restored Git receipt with path filtering.",
                changedPaths: [
                  "docs/payment-recovery.md",
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
    const { TodayDashboard } = await import("./today_dashboard");

    const html = renderToString(() => <TodayDashboard />);

    expect(html).toContain("docs/payment-recovery.md");
    expect(html).not.toContain("docs/Knowledge/notes.md");
    expect(html).not.toContain(".env");
    expect(html).not.toContain("config/app.pem");
    expect(html).not.toContain("docs/private-plan.md");
    expect(html).not.toContain("src/api_token.ts");
    expect(html).toContain("5 unsafe Git receipt path(s) were ignored.");
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
    if (existingIssue === null) throw new Error("Expected seed issue to be created.");

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
    expect(store.workOsState.issues.filter((issue) => issue.projectId === project.id)).toHaveLength(
      3,
    );
    expect(store.workOsState.issues.map((issue) => issue.title)).toContain(
      "Confirm launch checklist owner",
    );
    expect(store.workOsState.issues.find((issue) => issue.id === existingIssue.id)?.status).toBe(
      "doing",
    );
  });

  it("creates distinct Project OS issues from mocked OpenAI-compatible LLM analysis", async () => {
    let chatCalls = 0;
    const invokeMock = vi.fn(async (command: string, args?: unknown) => {
      if (command === "project_os_scan_folder") {
        const serializedArgs = JSON.stringify(args);
        if (serializedArgs.includes("release-work")) {
          return projectScan([
            {
              path: "docs/release-plan.md",
              snippet: "Release readiness notes for support handoff.",
            },
          ]);
        }
        return projectScan([
          {
            path: "docs/billing-recovery.md",
            snippet: "Billing recovery owner and customer checkpoint notes.",
          },
        ]);
      }
      if (command === "project_os_git_summary") {
        return JSON.stringify(args).includes("release-work")
          ? readyGitSummary("docs/release-plan.md")
          : notGitSummary();
      }
      if (command === "plugin_get_settings_with_secrets") return aiChatSettings("nvidia");
      if (command === "agent_get_agent_api_key_status") return { configured: true };
      if (command === "agent_run_openai_compatible_chat") {
        const projectId = projectIdFromRequestArgs(args);
        chatCalls += 1;
        return chatCalls === 1
          ? projectAnalysisResponse(
              projectId,
              "Clarify billing recovery ownership before launch",
              "docs/billing-recovery.md",
            )
          : projectAnalysisResponse(
              projectId,
              "Make release readiness visible to support owners",
              "docs/release-plan.md",
            );
      }
      throw new Error(`Unexpected invoke command: ${command}; args=${JSON.stringify(args)}`);
    });
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
    const store = await import("./work_os_store");
    const { runProjectOsAnalysis } = await import("./project_os_analysis_runner");
    const billingProject = store.createWorkProject({ name: "Billing recovery" });
    store.linkWorkProjectFolder(billingProject.id, {
      path: "/tmp/billing-work",
      name: "billing-work",
    });
    const releaseProject = store.createWorkProject({ name: "Release work" });
    store.linkWorkProjectFolder(releaseProject.id, {
      path: "/tmp/release-work",
      name: "release-work",
    });
    const firstProject = store.workOsState.projects.find((item) => item.id === billingProject.id);
    const secondProject = store.workOsState.projects.find((item) => item.id === releaseProject.id);
    if (firstProject === undefined || secondProject === undefined) {
      throw new Error("Expected linked projects.");
    }

    const firstResult = await runProjectOsAnalysis(firstProject);
    const secondResult = await runProjectOsAnalysis(secondProject);

    expect(firstResult.kind).toBe("applied");
    expect(secondResult.kind).toBe("applied");
    expect(store.workOsState.issues.map((issue) => issue.title)).toEqual(
      expect.arrayContaining([
        "Clarify billing recovery ownership before launch",
        "Make release readiness visible to support owners",
      ]),
    );
    expect(invokeMock).toHaveBeenCalledWith(
      "agent_run_openai_compatible_chat",
      expect.objectContaining({
        request: expect.objectContaining({
          apiConfig: {
            providerId: "nvidia",
            providerName: "NVIDIA NIM",
            baseUrl: "https://integrate.api.nvidia.com/v1",
            model: "nvidia/nemotron-3-ultra-550b-a55b",
          },
        }),
      }),
    );
    expect(invokeMock).not.toHaveBeenCalledWith(
      "agent_create_openai_compatible_plan",
      expect.anything(),
    );
    expect(invokeMock).not.toHaveBeenCalledWith("agent_create_codex_plan", expect.anything());
    const chatRequestPayloads = invokeMock.mock.calls
      .filter(([command]) => command === "agent_run_openai_compatible_chat")
      .map(([, args]) => JSON.stringify(args));
    expect(chatRequestPayloads).toHaveLength(2);
    expect(chatRequestPayloads[0]).toContain("docs/billing-recovery.md");
    expect(chatRequestPayloads[0]).toContain("gitChangeSummary");
    expect(chatRequestPayloads[1]).toContain("docs/release-plan.md");
    expect(chatRequestPayloads[1]).toContain("existingProjectOsIssues");
    expect(
      store.workOsState.projects.find((item) => item.id === releaseProject.id)
        ?.lastProjectOsRunReceipt?.git,
    ).toMatchObject({
      status: "summarized",
      changedPaths: ["docs/release-plan.md"],
    });
  });

  it("uses Codex chat when Codex CLI is the selected Project OS provider", async () => {
    const invokeMock = vi.fn(async (command: string, args?: unknown) => {
      if (command === "project_os_scan_folder") {
        return projectScan([
          {
            path: "docs/onboarding.md",
            snippet: "Onboarding checkpoint needs an owner.",
          },
        ]);
      }
      if (command === "project_os_git_summary") return notGitSummary();
      if (command === "plugin_get_settings_with_secrets") return aiChatSettings("codex_cli");
      if (command === "agent_check_codex_readiness") return { ready: true };
      if (command === "agent_run_codex_chat") {
        return projectAnalysisResponse(
          projectIdFromRequestArgs(args),
          "Assign onboarding checkpoint ownership",
          "docs/onboarding.md",
        );
      }
      throw new Error(`Unexpected invoke command: ${command}; args=${JSON.stringify(args)}`);
    });
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
    const store = await import("./work_os_store");
    const { runProjectOsAnalysis } = await import("./project_os_analysis_runner");
    const project = store.createWorkProject({ name: "Onboarding" });
    store.linkWorkProjectFolder(project.id, { path: "/tmp/onboarding", name: "onboarding" });
    const linkedProject = store.workOsState.projects.find((item) => item.id === project.id);
    if (linkedProject === undefined) throw new Error("Expected linked project.");

    const result = await runProjectOsAnalysis(linkedProject);

    expect(result.kind).toBe("applied");
    expect(invokeMock).toHaveBeenCalledWith("agent_run_codex_chat", {
      request: expect.objectContaining({
        mode: "ask",
        codexConfig: { model: "gpt-5-codex", sandbox: "read-only" },
      }),
    });
    expect(invokeMock).not.toHaveBeenCalledWith(
      "agent_run_openai_compatible_chat",
      expect.anything(),
    );
    expect(invokeMock).not.toHaveBeenCalledWith("agent_create_codex_plan", expect.anything());
    expect(store.workOsState.issues.map((issue) => issue.title)).toContain(
      "Assign onboarding checkpoint ownership",
    );
  });

  it("does not create Project OS issues when the selected provider is unavailable", async () => {
    const invokeMock = vi.fn(async (command: string, args?: unknown) => {
      if (command === "project_os_scan_folder") {
        return projectScan([
          {
            path: "docs/billing-recovery.md",
            snippet: "Billing recovery owner and customer checkpoint notes.",
          },
        ]);
      }
      if (command === "project_os_git_summary") return notGitSummary();
      if (command === "plugin_get_settings_with_secrets") return aiChatSettings("codex_cli");
      if (command === "agent_check_codex_readiness") return { ready: false };
      throw new Error(`Unexpected invoke command: ${command}; args=${JSON.stringify(args)}`);
    });
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
    const store = await import("./work_os_store");
    const { runProjectOsAnalysis } = await import("./project_os_analysis_runner");
    const project = store.createWorkProject({ name: "Billing recovery" });
    store.linkWorkProjectFolder(project.id, { path: "/tmp/billing-work", name: "billing-work" });
    const linkedProject = store.workOsState.projects.find((item) => item.id === project.id);
    if (linkedProject === undefined) throw new Error("Expected linked project.");

    const result = await runProjectOsAnalysis(linkedProject);

    expect(result.kind).toBe("failed");
    expect(store.workOsState.issues).toHaveLength(0);
    expect(store.workOsState.projects[0]?.lastProjectOsRunReceipt).toMatchObject({
      status: "failed",
      createdIssueIds: [],
      updatedIssueIds: [],
    });
    expect(store.workOsState.projects[0]?.manualSync.error).toBe(
      "Codex CLI is not ready for Project OS analysis.",
    );
    expect(invokeMock).not.toHaveBeenCalledWith("agent_run_codex_chat", expect.anything());
  });

  it("does not create Project OS issues when the selected Agent API key is missing", async () => {
    const invokeMock = vi.fn(async (command: string, args?: unknown) => {
      if (command === "project_os_scan_folder") {
        return projectScan([
          {
            path: "docs/billing-recovery.md",
            snippet: "Billing recovery owner and customer checkpoint notes.",
          },
        ]);
      }
      if (command === "project_os_git_summary") return notGitSummary();
      if (command === "plugin_get_settings_with_secrets") return aiChatSettings("nvidia");
      if (command === "agent_get_agent_api_key_status") return { configured: false };
      throw new Error(`Unexpected invoke command: ${command}; args=${JSON.stringify(args)}`);
    });
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
    const store = await import("./work_os_store");
    const { runProjectOsAnalysis } = await import("./project_os_analysis_runner");
    const project = store.createWorkProject({ name: "Billing recovery" });
    store.linkWorkProjectFolder(project.id, { path: "/tmp/billing-work", name: "billing-work" });
    const linkedProject = store.workOsState.projects.find((item) => item.id === project.id);
    if (linkedProject === undefined) throw new Error("Expected linked project.");

    const result = await runProjectOsAnalysis(linkedProject);

    expect(result.kind).toBe("failed");
    expect(store.workOsState.issues).toHaveLength(0);
    expect(store.workOsState.projects[0]?.manualSync.error).toBe(
      "NVIDIA NIM API key is not configured.",
    );
    expect(invokeMock).not.toHaveBeenCalledWith(
      "agent_run_openai_compatible_chat",
      expect.anything(),
    );
  });

  it("does not create Project OS issues when the provider returns invalid JSON", async () => {
    const invokeMock = vi.fn(async (command: string, args?: unknown) => {
      if (command === "project_os_scan_folder") {
        return projectScan([
          {
            path: "docs/billing-recovery.md",
            snippet: "Billing recovery owner and customer checkpoint notes.",
          },
        ]);
      }
      if (command === "project_os_git_summary") return notGitSummary();
      if (command === "plugin_get_settings_with_secrets") return aiChatSettings("nvidia");
      if (command === "agent_get_agent_api_key_status") return { configured: true };
      if (command === "agent_run_openai_compatible_chat") return { content: "not json" };
      throw new Error(`Unexpected invoke command: ${command}; args=${JSON.stringify(args)}`);
    });
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
    const store = await import("./work_os_store");
    const { runProjectOsAnalysis } = await import("./project_os_analysis_runner");
    const project = store.createWorkProject({ name: "Billing recovery" });
    store.linkWorkProjectFolder(project.id, { path: "/tmp/billing-work", name: "billing-work" });
    const linkedProject = store.workOsState.projects.find((item) => item.id === project.id);
    if (linkedProject === undefined) throw new Error("Expected linked project.");

    const result = await runProjectOsAnalysis(linkedProject);

    expect(result.kind).toBe("failed");
    expect(store.workOsState.issues).toHaveLength(0);
    expect(store.workOsState.projects[0]?.manualSync.error).toBe(
      "ProjectAnalysisPlan must be valid JSON",
    );
  });

  it("keeps the last successful Git commit after a failed Git summary", async () => {
    const lastGoodHead = "1111111111111111111111111111111111111111";
    const nextHead = "2222222222222222222222222222222222222222";
    let gitSummaryReads = 0;
    const invokeMock = vi.fn(async (command: string, args?: unknown) => {
      if (command === "project_os_scan_folder") {
        return projectScan([
          {
            path: "docs/release-plan.md",
            snippet: "Release readiness notes for support handoff.",
          },
        ]);
      }
      if (command === "project_os_git_summary") {
        gitSummaryReads += 1;
        if (gitSummaryReads === 1) {
          throw new Error(`git unavailable for ${JSON.stringify(args)}`);
        }
        return {
          ...readyGitSummary("docs/release-plan.md", lastGoodHead),
          head: nextHead,
          range: `${lastGoodHead}..HEAD`,
        };
      }
      if (command === "plugin_get_settings_with_secrets") return aiChatSettings("nvidia");
      if (command === "agent_get_agent_api_key_status") return { configured: true };
      if (command === "agent_run_openai_compatible_chat") {
        return projectAnalysisResponse(
          projectIdFromRequestArgs(args),
          "Make release readiness visible to support owners",
          "docs/release-plan.md",
        );
      }
      throw new Error(`Unexpected invoke command: ${command}; args=${JSON.stringify(args)}`);
    });
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
    const store = await import("./work_os_store");
    const { runProjectOsAnalysis } = await import("./project_os_analysis_runner");
    const project = store.createWorkProject({ name: "Flaky Git" });
    store.linkWorkProjectFolder(project.id, { path: "/tmp/flaky-git", name: "flaky-git" });
    store.recordProjectOsRunReceipt(project.id, {
      runId: "last-good-git",
      status: "applied",
      summary: "Previous analysis succeeded.",
      createdIssueIds: [],
      updatedIssueIds: [],
      finishedAt: "2026-07-04T01:02:00.000Z",
      git: {
        status: "summarized",
        headCommit: lastGoodHead,
        previousCommit: "",
        range: "HEAD",
        summary: "Previous Git receipt.",
        changedPaths: ["docs/release-plan.md"],
        error: "",
      },
    });

    const firstProject = store.workOsState.projects.find((item) => item.id === project.id);
    if (firstProject === undefined) throw new Error("Expected linked project.");
    const firstResult = await runProjectOsAnalysis(firstProject);
    const secondProject = store.workOsState.projects.find((item) => item.id === project.id);
    if (secondProject === undefined) throw new Error("Expected linked project after first run.");
    const secondResult = await runProjectOsAnalysis(secondProject);

    expect(firstResult.kind).toBe("applied");
    expect(secondResult.kind).toBe("applied");
    const gitSummaryCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "project_os_git_summary",
    );
    expect(gitSummaryCalls.map(([, args]) => args)).toEqual([
      expect.objectContaining({ previousCommit: lastGoodHead }),
      expect.objectContaining({ previousCommit: lastGoodHead }),
    ]);
    expect(store.workOsState.projects[0]?.lastProjectOsRunReceipt?.git).toMatchObject({
      status: "summarized",
      headCommit: nextHead,
      previousCommit: lastGoodHead,
      range: `${lastGoodHead}..HEAD`,
    });
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
