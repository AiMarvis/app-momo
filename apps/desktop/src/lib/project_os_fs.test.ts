import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  chooseProjectOsFolder,
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
    const summary = {
      status: "notGit",
      head: null,
      previousCommit: "abc1234",
      range: null,
      changedPaths: [],
      statusShort: [],
      diffNameStatus: [],
      diffStat: [],
      logOneline: [],
      message: "Project folder is not a Git repository.",
    };
    mockInvoke.mockResolvedValueOnce(summary);

    await expect(readProjectGitSummary("/tmp/project", "abc1234")).resolves.toEqual(summary);
    expect(mockInvoke).toHaveBeenCalledWith("project_os_git_summary", {
      path: "/tmp/project",
      previousCommit: "abc1234",
    });
  });

  it("accepts safe Git rename status lines as project-local evidence", async () => {
    const summary = {
      status: "ready",
      head: "ccccccc",
      previousCommit: null,
      range: null,
      changedPaths: ["src/old.ts", "src/new.ts"],
      statusShort: [" R src/old.ts -> src/new.ts"],
      diffNameStatus: ["R100\tsrc/old.ts\tsrc/new.ts"],
      diffStat: ["src/{old.ts => new.ts} | 2 +-"],
      logOneline: ["ccccccc Rename setup step"],
      message: null,
    };
    mockInvoke.mockResolvedValueOnce(summary);

    await expect(readProjectGitSummary("/tmp/project", null)).resolves.toEqual(summary);
  });

  it("drops stale commit log entries when the previous analyzed commit is already HEAD", async () => {
    const summary = {
      status: "ready",
      head: "ddddddd",
      previousCommit: "ddddddd",
      range: null,
      changedPaths: [],
      statusShort: [],
      diffNameStatus: [],
      diffStat: [],
      logOneline: ["ddddddd stale release commit"],
      message: null,
    };
    mockInvoke.mockResolvedValueOnce(summary);

    await expect(readProjectGitSummary("/tmp/project", "ddddddd")).resolves.toEqual({
      ...summary,
      logOneline: [],
    });
  });

  it("rejects Git summaries that contain unsafe, outside, or second-brain paths", async () => {
    for (const path of ["/tmp/secret.md", "../secret.md", "Inbox/raw.md"]) {
      mockInvoke.mockResolvedValueOnce({
        status: "ready",
        head: "abc1234",
        previousCommit: null,
        range: "abc1234",
        changedPaths: [path],
        statusShort: [` M ${path}`],
        diffNameStatus: [],
        diffStat: [],
        logOneline: [],
        message: null,
      });

      await expect(readProjectGitSummary("/tmp/project", null)).rejects.toThrow(
        /invalid project git summary path/i,
      );
    }
  });

  it("rejects Git summaries that contain secret-looking paths", async () => {
    for (const path of [".env", "config/app.pem", "docs/private-plan.md", "src/api_token.ts"]) {
      mockInvoke.mockResolvedValueOnce({
        status: "ready",
        head: "abc1234",
        previousCommit: null,
        range: "abc1234",
        changedPaths: [path],
        statusShort: [` M ${path}`],
        diffNameStatus: [],
        diffStat: [],
        logOneline: [],
        message: null,
      });

      await expect(readProjectGitSummary("/tmp/project", null)).rejects.toThrow(
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
      mockInvoke.mockResolvedValueOnce({
        status: "ready",
        head: "abc1234",
        previousCommit: null,
        range: "abc1234",
        changedPaths: ["src/main.ts"],
        statusShort: [],
        diffNameStatus: [],
        diffStat: [],
        logOneline: [line],
        message: null,
      });

      await expect(readProjectGitSummary("/tmp/project", null)).rejects.toThrow(
        /invalid project git summary log line/i,
      );
    }
  });
});
