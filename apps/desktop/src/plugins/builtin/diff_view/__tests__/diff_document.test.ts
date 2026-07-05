import { describe, expect, it } from "vitest";

import type { PMMarkJSON, PMNodeJSON } from "~/lib/markdown";

import { buildDiffDocument } from "../diff_document";

function text(value: string, marks?: string[]): PMNodeJSON {
  const node: PMNodeJSON = { type: "text", text: value };
  if (marks && marks.length > 0) {
    node.marks = marks.map((type) => ({ type }));
  }
  return node;
}

function paragraph(...content: PMNodeJSON[]): PMNodeJSON {
  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

function heading(level: number, ...content: PMNodeJSON[]): PMNodeJSON {
  return content.length > 0
    ? { type: "heading", attrs: { level }, content }
    : { type: "heading", attrs: { level } };
}

function codeBlock(value: string): PMNodeJSON {
  return {
    type: "codeBlock",
    attrs: { language: "ts" },
    content: value.length > 0 ? [text(value)] : undefined,
  };
}

function listNode(label: string): PMNodeJSON {
  return {
    type: "list",
    attrs: { kind: "bullet" },
    content: [
      {
        type: "listItem",
        attrs: { kind: "bullet", checked: null, collapsed: false },
        content: [paragraph(text(label))],
      },
    ],
  };
}

function wikilink(target: string, alias?: string): PMNodeJSON {
  return {
    type: "wikilink",
    attrs: {
      target,
      alias: alias ?? null,
    },
  };
}

function doc(...content: PMNodeJSON[]): PMNodeJSON {
  return { type: "doc", content };
}

function diffTypes(node: PMNodeJSON): string[] {
  return (node.content ?? []).map((child) =>
    typeof child.attrs?.diffType === "string" ? child.attrs.diffType : "",
  );
}

function wrappedBlock(node: PMNodeJSON, index: number): PMNodeJSON | undefined {
  return node.content?.[index]?.content?.[0];
}

function markTypes(marks: PMMarkJSON[] | undefined): string[] {
  return (marks ?? []).map((mark) => mark.type);
}

describe("buildDiffDocument", () => {
  it("builds unchanged, modified, removed, and added wrappers with inline marks", () => {
    const result = buildDiffDocument(
      doc(paragraph(text("Alpha")), paragraph(text("Beta")), paragraph(text("Gone"))),
      doc(paragraph(text("Alpha")), paragraph(text("Better")), paragraph(text("Gamma"))),
    );

    expect(diffTypes(result)).toEqual(["unchanged", "modified", "removed", "added"]);

    const modified = wrappedBlock(result, 1);
    expect(modified?.type).toBe("paragraph");
    expect(
      (modified?.content ?? []).map((child) => ({
        text: child.text ?? "",
        marks: markTypes(child.marks),
      })),
    ).toEqual([
      { text: "Bet", marks: [] },
      { text: "a", marks: ["diffRemoved"] },
      { text: "ter", marks: ["diffAdded"] },
    ]);
  });

  it("keeps unchanged mixed blocks and falls back to block add/remove where inline diff is not valid", () => {
    const result = buildDiffDocument(
      doc(
        heading(1, text("Plan A")),
        paragraph(text("See "), wikilink("notes/a.md"), text(" today")),
        codeBlock("const oldValue = 1;"),
        listNode("keep me"),
      ),
      doc(
        heading(1, text("Plan B")),
        paragraph(text("See "), wikilink("notes/a.md"), text(" today")),
        codeBlock("const nextValue = 2;"),
        listNode("keep me"),
      ),
    );

    expect(diffTypes(result)).toEqual(["modified", "unchanged", "removed", "added", "unchanged"]);
    expect(wrappedBlock(result, 0)?.type).toBe("heading");
    expect(wrappedBlock(result, 1)?.content?.[1]).toMatchObject({
      type: "wikilink",
      attrs: { target: "notes/a.md", alias: null },
    });
    expect(wrappedBlock(result, 2)?.type).toBe("codeBlock");
    expect(wrappedBlock(result, 3)?.type).toBe("codeBlock");
    expect(wrappedBlock(result, 4)?.type).toBe("list");
  });

  it("falls back to removed plus added blocks when atomic inline nodes change", () => {
    const result = buildDiffDocument(
      doc(paragraph(text("See "), wikilink("notes/a.md"), text(" today"))),
      doc(paragraph(text("See "), wikilink("notes/b.md"), text(" today"))),
    );

    expect(diffTypes(result)).toEqual(["removed", "added"]);
  });
});
