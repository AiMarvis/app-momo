import { beforeAll, describe, expect, it } from "vitest";
import type {
  canOpenApprovalDiff as canOpenApprovalDiffType,
  getEditFileDiffTarget as getEditFileDiffTargetType,
} from "./approval_diff";

let canOpenApprovalDiff: typeof canOpenApprovalDiffType;
let getEditFileDiffTarget: typeof getEditFileDiffTargetType;

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

  ({ canOpenApprovalDiff, getEditFileDiffTarget } = await import("./approval_diff"));
});

describe("approval diff helpers", () => {
  it("extracts replaceFile payloads for edit_file approvals", () => {
    const result = getEditFileDiffTarget({
      summary: "Edit notes/a.md",
      operations: [
        {
          kind: "replaceFile",
          path: "notes/a.md",
          content: "# updated",
          expectedChecksum: "abc",
        },
      ],
    });

    expect(result).toEqual({
      path: "notes/a.md",
      newMarkdown: "# updated",
    });
    expect(
      canOpenApprovalDiff(
        {
          summary: "Edit notes/a.md",
          operations: [
            {
              kind: "replaceFile",
              path: "notes/a.md",
              content: "# updated",
            },
          ],
        },
        "edit_file",
      ),
    ).toBe(true);
  });

  it("rejects non-edit mutations and malformed operations", () => {
    expect(
      canOpenApprovalDiff(
        {
          summary: "Create notes/a.md",
          operations: [{ kind: "createFile", path: "notes/a.md", content: "# new" }],
        },
        "create_file",
      ),
    ).toBe(false);
    expect(getEditFileDiffTarget({ operations: [] })).toBeNull();
    expect(
      getEditFileDiffTarget({
        operations: [{ kind: "replaceFile", path: "notes/a.md" }],
      }),
    ).toBeNull();
  });
});
