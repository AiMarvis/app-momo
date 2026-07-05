import { describe, expect, it } from "vitest";

import {
  createDiffTabPath,
  getDiffEntry,
  getSourceFilePathFromDiffPath,
  isDiffTabPath,
  renameDiffEntriesForMovedPath,
  registerDiff,
  removeDiffEntry,
} from "~/stores/diff_store";

describe("diff store", () => {
  it("registers, overwrites, and removes diff entries by source path", () => {
    const firstPath = registerDiff("notes/a.md", "old", "new", { type: "doc", content: [] });
    const secondPath = registerDiff("notes/a.md", "older", "newer", {
      type: "doc",
      content: [
        { type: "diffBlock", attrs: { diffType: "modified" }, content: [{ type: "paragraph" }] },
      ],
    });

    expect(firstPath).toBe("diff://notes/a.md");
    expect(secondPath).toBe(firstPath);
    expect(getDiffEntry(firstPath)).toMatchObject({
      sourceFilePath: "notes/a.md",
      oldMarkdown: "older",
      newMarkdown: "newer",
    });

    removeDiffEntry(firstPath);
    expect(getDiffEntry(firstPath)).toBeUndefined();
  });

  it("exposes diff path helpers", () => {
    const diffPath = createDiffTabPath("notes/topic.md");

    expect(diffPath).toBe("diff://notes/topic.md");
    expect(isDiffTabPath(diffPath)).toBe(true);
    expect(isDiffTabPath("notes/topic.md")).toBe(false);
    expect(getSourceFilePathFromDiffPath(diffPath)).toBe("notes/topic.md");
    expect(getSourceFilePathFromDiffPath("notes/topic.md")).toBeNull();
  });

  it("renames diff entries for moved files and folders", () => {
    const fileDiffPath = registerDiff("notes/a.md", "old", "new", { type: "doc", content: [] });
    const folderDiffPath = registerDiff("notes/archive/b.md", "older", "newer", {
      type: "doc",
      content: [],
    });

    renameDiffEntriesForMovedPath("notes/a.md", "notes/b.md", false);
    renameDiffEntriesForMovedPath("notes/archive", "notes/renamed", true);

    expect(getDiffEntry(fileDiffPath)).toBeUndefined();
    expect(getDiffEntry(folderDiffPath)).toBeUndefined();
    expect(getDiffEntry("diff://notes/b.md")?.sourceFilePath).toBe("notes/b.md");
    expect(getDiffEntry("diff://notes/renamed/b.md")?.sourceFilePath).toBe("notes/renamed/b.md");

    removeDiffEntry("diff://notes/b.md");
    removeDiffEntry("diff://notes/renamed/b.md");
  });
});
