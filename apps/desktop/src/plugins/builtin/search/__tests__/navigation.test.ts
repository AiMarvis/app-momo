import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type {
  applyPendingSearchNavigation as ApplyPendingSearchNavigation,
  clearPendingSearchNavigation as ClearPendingSearchNavigation,
  findSectionHeadingPosition as FindSectionHeadingPosition,
  getPendingSearchNavigation as GetPendingSearchNavigation,
  queuePendingSearchNavigation as QueuePendingSearchNavigation,
} from "../navigation";

let applyPendingSearchNavigation: typeof ApplyPendingSearchNavigation;
let clearPendingSearchNavigation: typeof ClearPendingSearchNavigation;
let findSectionHeadingPosition: typeof FindSectionHeadingPosition;
let getPendingSearchNavigation: typeof GetPendingSearchNavigation;
let queuePendingSearchNavigation: typeof QueuePendingSearchNavigation;

beforeAll(async () => {
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    },
    configurable: true,
  });

  ({
    applyPendingSearchNavigation,
    clearPendingSearchNavigation,
    findSectionHeadingPosition,
    getPendingSearchNavigation,
    queuePendingSearchNavigation,
  } = await import("../navigation"));
});

afterEach(() => {
  clearPendingSearchNavigation();
});

describe("findSectionHeadingPosition", () => {
  it("returns the top position for title hits", () => {
    expect(findSectionHeadingPosition([], [])).toBe(1);
  });

  it("matches the first heading with the requested section path", () => {
    expect(
      findSectionHeadingPosition(
        [
          { level: 1, text: "Alpha", pos: 5 },
          { level: 2, text: "Beta", pos: 10 },
          { level: 1, text: "Gamma", pos: 20 },
        ],
        ["Alpha", "Beta"],
        0,
      ),
    ).toBe(10);
  });

  it("uses the section ordinal when the same path appears multiple times", () => {
    expect(
      findSectionHeadingPosition(
        [
          { level: 1, text: "Alpha", pos: 5 },
          { level: 2, text: "Beta", pos: 10 },
          { level: 1, text: "Alpha", pos: 20 },
          { level: 2, text: "Beta", pos: 25 },
        ],
        ["Alpha", "Beta"],
        1,
      ),
    ).toBe(25);
  });

  it("falls back when the section path no longer exists", () => {
    expect(
      findSectionHeadingPosition([{ level: 1, text: "Alpha", pos: 5 }], ["Alpha", "Missing"], 0),
    ).toBeNull();
  });

  it("keeps pending navigation when headings are not loaded yet", () => {
    queuePendingSearchNavigation({
      docId: "note.md",
      title: "Alpha",
      sectionPath: ["Alpha"],
      sectionOrdinal: 0,
      snippet: "Alpha",
      kind: "Heading",
      score: 1,
    });

    const editor = {
      view: {
        state: {
          doc: {
            descendants: () => undefined,
          },
        },
      },
    } as never;

    expect(applyPendingSearchNavigation(editor, "note.md")).toBe(false);
    expect(getPendingSearchNavigation()).toEqual({
      filePath: "note.md",
      sectionPath: ["Alpha"],
      sectionOrdinal: 0,
    });
  });
});
