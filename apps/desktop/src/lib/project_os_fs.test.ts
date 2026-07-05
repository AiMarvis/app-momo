import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  chooseProjectOsFolder,
  type ProjectOsManifest,
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
});
