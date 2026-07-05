import { describe, expect, it } from "vitest";

import type { FileEntry } from "~/lib/vault_types";
import { sortVaultEntriesNaturally } from "~/lib/vault_sort";

describe("sortVaultEntriesNaturally", () => {
  it("sorts sibling entries with folder-first natural ordering", () => {
    const entries: FileEntry[] = [
      {
        name: "File 10.md",
        path: "File 10.md",
        is_directory: false,
      },
      {
        name: "Folder 10",
        path: "Folder 10",
        is_directory: true,
        children: [],
      },
      {
        name: "Folder 2",
        path: "Folder 2",
        is_directory: true,
        children: [],
      },
      {
        name: "File 2.md",
        path: "File 2.md",
        is_directory: false,
      },
    ];

    expect(sortVaultEntriesNaturally(entries).map((entry) => entry.name)).toEqual([
      "Folder 2",
      "Folder 10",
      "File 2.md",
      "File 10.md",
    ]);
  });

  it("sorts nested children recursively using locale-aware natural ordering", () => {
    const entries: FileEntry[] = [
      {
        name: "notes",
        path: "notes",
        is_directory: true,
        children: [
          {
            name: "나 10.md",
            path: "notes/나 10.md",
            is_directory: false,
          },
          {
            name: "가 2.md",
            path: "notes/가 2.md",
            is_directory: false,
          },
          {
            name: "가 10.md",
            path: "notes/가 10.md",
            is_directory: false,
          },
        ],
      },
    ];

    const sorted = sortVaultEntriesNaturally(entries, "ko");

    expect(sorted[0].children?.map((entry) => entry.name)).toEqual([
      "가 2.md",
      "가 10.md",
      "나 10.md",
    ]);
  });
});
