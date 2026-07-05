import { afterEach, describe, expect, it, vi } from "vitest";

import { dispatchAnchorClick } from "~/plugins/anchor_handlers";
import { openTab } from "~/stores/files";

import { wikilinkPlugin } from "../index";

vi.mock("~/stores/files", () => ({
  openTab: vi.fn(),
}));

vi.mock("~/stores/vault", () => ({
  existsInTree: vi.fn(() => true),
  vaultState: { files: [] },
}));

describe("wikilinkPlugin resolver click", () => {
  const disposers: (() => void)[] = [];

  afterEach(() => {
    while (disposers.length > 0) {
      disposers.pop()?.();
    }
    vi.clearAllMocks();
  });

  it("uses the core indexer resolver before opening a note", async () => {
    const resolveWikilink = vi.fn().mockResolvedValue({
      resolvedPath: "notes/alpha.md",
      resolutionKind: "basename",
    });

    await wikilinkPlugin.activate?.({
      services: {
        get: () =>
          ({
            resolveWikilink,
          }) as unknown,
      },
      editor: {
        activeFilePath: "daily/today.md",
      },
      track: (disposer: () => void) => disposers.push(disposer),
    } as never);

    const handled = dispatchAnchorClick({
      matches: () => true,
      getAttribute: (name: string) => (name === "data-target" ? "alpha" : null),
    } as unknown as HTMLAnchorElement);

    expect(handled).toBe(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(resolveWikilink).toHaveBeenCalledWith("daily/today.md", "alpha");
    expect(openTab).toHaveBeenCalledWith("alpha", "notes/alpha.md");
  });
});
