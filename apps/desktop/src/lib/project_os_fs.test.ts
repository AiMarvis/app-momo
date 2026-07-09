import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  chooseProjectOsFolder,
  type ProjectGitSummary,
  type ProjectOsManifest,
  readProjectGitSummary,
  scanProjectOsFolder,
} from "./project_os_fs";

const mockInvoke = vi.hoisted(() =>
  vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(),
);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

function manifestWithPath(path: string): ProjectOsManifest {
  return {
    rootName: "project",
    files: [{ path, size: 19, snippet: "export const ok = true;" }],
    skipped: [],
    limits: {
      maxFiles: 200,
      maxBytes: 524288,
      bytesRead: 19,
      truncated: false,
    },
  };
}

function gitSummary(summary: Partial<ProjectGitSummary> = {}): ProjectGitSummary {
  return {
    status: "ready",
    head: "abc1234",
    previousCommit: null,
    range: "HEAD",
    changedPaths: [],
    statusShort: [],
    diffNameStatus: [],
    diffStat: [],
    logOneline: [],
    commitsByDate: [],
    workingTree: { stagedPaths: [], unstagedPaths: [], untrackedPaths: [] },
    message: null,
    ...summary,
  };
}

describe("project_os_fs", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("rejects malformed project roots before invoking Rust", async () => {
    for (const path of ["", "relative/project", "../project", "/tmp/../project", "bad\0path"]) {
      await expect(scanProjectOsFolder(path)).rejects.toThrow(/invalid project root/i);
    }

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("uses separate Project OS commands for folder choice and scan", async () => {
    const manifest = manifestWithPath("src/main.ts");
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "project_os_choose_folder":
          return "/tmp/project";
        case "project_os_scan_folder":
          return manifest;
        default:
          throw new Error(`unexpected command: ${command}`);
      }
    });

    await expect(chooseProjectOsFolder()).resolves.toBe("/tmp/project");
    await expect(scanProjectOsFolder("/tmp/project")).resolves.toEqual(manifest);
    expect(mockInvoke).toHaveBeenCalledWith("project_os_scan_folder", { path: "/tmp/project" });
  });

  it("rejects backend manifests that contain unsafe paths", async () => {
    for (const path of ["/tmp/secret.md", "../secret.md"]) {
      mockInvoke.mockResolvedValueOnce(manifestWithPath(path));

      await expect(scanProjectOsFolder("/tmp/project")).rejects.toThrow(
        /invalid project manifest path/i,
      );
    }
  });

  it("accepts non-Git project summaries as non-fatal results", async () => {
    const summary = gitSummary({
      status: "notGit",
      head: null,
      previousCommit: "abc1234",
      range: null,
      message: "Project folder is not a Git repository.",
    });
    mockInvoke.mockResolvedValueOnce(summary);

    await expect(readProjectGitSummary("/tmp/project", { previousCommit: "abc1234" })).resolves.toEqual(
      summary,
    );
    expect(mockInvoke).toHaveBeenCalledWith("project_os_git_summary", {
      path: "/tmp/project",
      previousCommit: "abc1234",
      startDate: null,
      endDate: null,
    });
  });

  it("requests bounded schedule-range Git metadata without exposing file contents", async () => {
    const summary = gitSummary({
      head: "ddddddd",
      range: "2026-07-01..2026-07-03",
      changedPaths: ["docs/release.md"],
      commitsByDate: [
        { date: "2026-07-01", commits: [] },
        {
          date: "2026-07-02",
          commits: [
            {
              shortHash: "ddddddd",
              subject: "Prepare release note",
              author: "Momo",
              authorDate: "2026-07-02T10:30:00+09:00",
              changedPaths: ["docs/release.md"],
              diffStat: [{ path: "docs/release.md", additions: 4, deletions: 1 }],
            },
          ],
        },
        { date: "2026-07-03", commits: [] },
      ],
      workingTree: {
        stagedPaths: ["docs/release.md"],
        unstagedPaths: ["src/app.ts"],
        untrackedPaths: ["docs/todo.md"],
      },
    });
    mockInvoke.mockResolvedValueOnce(summary);

    await expect(
      readProjectGitSummary("/tmp/project", { startDate: "2026-07-01", endDate: "2026-07-03" }),
    ).resolves.toEqual(summary);
    expect(mockInvoke).toHaveBeenCalledWith("project_os_git_summary", {
      path: "/tmp/project",
      previousCommit: null,
      startDate: "2026-07-01",
      endDate: "2026-07-03",
    });
  });

  it("accepts safe Git rename status lines as project-local evidence", async () => {
    const summary = gitSummary({
      head: "ccccccc",
      range: null,
      changedPaths: ["src/old.ts", "src/new.ts"],
      statusShort: [" R src/old.ts -> src/new.ts"],
      diffNameStatus: ["R100\tsrc/old.ts\tsrc/new.ts"],
      diffStat: ["src/{old.ts => new.ts} | 2 +-"],
      logOneline: ["ccccccc Rename setup step"],
    });
    mockInvoke.mockResolvedValueOnce(summary);

    await expect(readProjectGitSummary("/tmp/project", {})).resolves.toEqual(summary);
  });

  it("drops stale commit log entries when the previous analyzed commit is already HEAD", async () => {
    const summary = gitSummary({
      head: "ddddddd",
      previousCommit: "ddddddd",
      range: null,
      logOneline: ["ddddddd stale release commit"],
    });
    mockInvoke.mockResolvedValueOnce(summary);

    await expect(readProjectGitSummary("/tmp/project", { previousCommit: "ddddddd" })).resolves.toEqual({
      ...summary,
      logOneline: [],
    });
  });

  it("rejects Git summaries that contain unsafe, outside, or second-brain paths", async () => {
    for (const path of ["/tmp/secret.md", "../secret.md", "Inbox/raw.md"]) {
      mockInvoke.mockResolvedValueOnce(gitSummary({
        range: "abc1234",
        changedPaths: [path],
        statusShort: [` M ${path}`],
      }));

      await expect(readProjectGitSummary("/tmp/project", {})).rejects.toThrow(
        /invalid project git summary path/i,
      );
    }
  });

  it("rejects Git summaries that contain secret-looking paths", async () => {
    for (const path of [".env", "config/app.pem", "docs/private-plan.md", "src/api_token.ts"]) {
      mockInvoke.mockResolvedValueOnce(gitSummary({
        range: "abc1234",
        changedPaths: [path],
        statusShort: [` M ${path}`],
      }));

      await expect(readProjectGitSummary("/tmp/project", {})).rejects.toThrow(
        /invalid project git summary path/i,
      );
    }
  });

  it("rejects Git log subjects that mention unsafe or second-brain paths", async () => {
    for (const line of [
      "abc1234 Mention Knowledge/raw.md in release notes",
      "abc1234 Explain ../private-plan.md",
      "abc1234 Update docs/private-plan.md",
    ]) {
      mockInvoke.mockResolvedValueOnce(gitSummary({
        range: "abc1234",
        changedPaths: ["src/main.ts"],
        logOneline: [line],
      }));

      await expect(readProjectGitSummary("/tmp/project", {})).rejects.toThrow(
        /invalid project git summary log line/i,
      );
    }
  });

  it("rejects unsafe paths inside schedule commit metadata and working tree buckets", async () => {
    mockInvoke.mockResolvedValueOnce(gitSummary({
      commitsByDate: [
        {
          date: "2026-07-02",
          commits: [
            {
              shortHash: "abc1234",
              subject: "Mention release work",
              author: "Momo",
              authorDate: "2026-07-02T10:30:00+09:00",
              changedPaths: ["Knowledge/raw.md"],
              diffStat: [{ path: "docs/release.md", additions: 1, deletions: 0 }],
            },
          ],
        },
      ],
      workingTree: { stagedPaths: [], unstagedPaths: [], untrackedPaths: [] },
    }));

    await expect(readProjectGitSummary("/tmp/project", {})).rejects.toThrow(
      /invalid project git summary path/i,
    );

    mockInvoke.mockResolvedValueOnce(gitSummary({
      workingTree: {
        stagedPaths: ["docs/release.md"],
        unstagedPaths: ["../outside.md"],
        untrackedPaths: [],
      },
    }));

    await expect(readProjectGitSummary("/tmp/project", {})).rejects.toThrow(
      /invalid project git summary path/i,
    );
  });
});
