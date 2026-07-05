import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  STARTER_WORKSPACE_FOLDERS,
  createMissingStarterWorkspaceFolders,
  missingStarterWorkspaceFolders,
} from "./starter_workspace";

describe("starter workspace folders", () => {
  it("creates only missing operating folders and preserves existing notes", async () => {
    const vaultRoot = await mkdtemp(join(tmpdir(), "momo-starter-workspace-"));
    try {
      await mkdir(join(vaultRoot, "Inbox"));
      await mkdir(join(vaultRoot, ".AgentRuns"));
      await writeFile(join(vaultRoot, "Existing.md"), "# Existing\n", "utf8");

      const created = await createMissingStarterWorkspaceFolders(await readdir(vaultRoot), (path) =>
        mkdir(join(vaultRoot, path)),
      );

      expect(created).toEqual(["Daily", "Tasks", "Projects", "Issues", "Calendar", "Knowledge"]);
      await expect(readFile(join(vaultRoot, "Existing.md"), "utf8")).resolves.toBe("# Existing\n");
      await expect(readdir(vaultRoot)).resolves.toEqual(
        expect.arrayContaining([...STARTER_WORKSPACE_FOLDERS, "Existing.md"]),
      );
    } finally {
      await rm(vaultRoot, { recursive: true, force: true });
    }
  });

  it("ignores malformed existing names when deciding what is already present", () => {
    expect(missingStarterWorkspaceFolders(["inbox", "/Daily", "../Tasks", "Projects\0"])).toEqual([
      "Daily",
      "Tasks",
      "Projects",
      "Issues",
      "Calendar",
      "Knowledge",
      ".AgentRuns",
    ]);
  });
});
