// @vitest-environment jsdom

import { createEditor, union } from "prosekit/core";
import { defineDoc } from "prosekit/extensions/doc";
import { defineParagraph } from "prosekit/extensions/paragraph";
import { defineText } from "prosekit/extensions/text";
import type { Node as ProseMirrorNode } from "prosekit/pm/model";
import { NodeSelection, TextSelection } from "prosekit/pm/state";
import type { EditorView } from "prosekit/pm/view";
import { CellSelection, TableMap } from "prosemirror-tables";
import { describe, expect, it } from "vitest";

import {
  defineTable,
  exitTableToParagraphForTest,
  goToNextCellOrCreateRowForTest,
  selectTableNodeForTest,
} from "../nodes/table";

function createTestEditor() {
  return createEditor({
    extension: union(defineDoc(), defineText(), defineParagraph(), defineTable()),
  });
}

function mountEditor(content: Parameters<ReturnType<typeof createTestEditor>["setContent"]>[0]) {
  const editor = createTestEditor();
  const host = document.createElement("div");
  document.body.append(host);
  editor.mount(host);
  editor.setContent(content);
  return { editor, host, view: editor.view };
}

function cell(type: "tableCell" | "tableHeaderCell" = "tableCell", text?: string) {
  return {
    type,
    content: [
      {
        type: "paragraph",
        ...(text ? { content: [{ type: "text", text }] } : {}),
      },
    ],
  };
}

function tableDoc(options: { trailingParagraph?: string } = {}) {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [cell("tableHeaderCell", "h1"), cell("tableHeaderCell", "h2")],
          },
          {
            type: "tableRow",
            content: [cell("tableCell", "a1"), cell("tableCell", "a2")],
          },
        ],
      },
      ...(options.trailingParagraph !== undefined
        ? [
            {
              type: "paragraph",
              content: [{ type: "text", text: options.trailingParagraph }],
            },
          ]
        : []),
    ],
  };
}

function paragraph(text: string) {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function findCells(view: EditorView): { node: ProseMirrorNode; pos: number }[] {
  const cells: { node: ProseMirrorNode; pos: number }[] = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === "tableCell" || node.type.name === "tableHeaderCell") {
      cells.push({ node, pos });
    }
  });
  return cells;
}

function setCursorInCell(view: EditorView, index: number): void {
  const target = findCells(view)[index];
  if (!target) throw new Error(`Missing table cell ${index}`);

  const pos = target.pos + 2;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

function selectedCellIndex(view: EditorView): number {
  const { $from } = view.state.selection;
  let cellPos = -1;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const nodeName = $from.node(depth).type.name;
    if (nodeName === "tableCell" || nodeName === "tableHeaderCell") {
      cellPos = $from.before(depth);
      break;
    }
  }

  return findCells(view).findIndex((entry) => entry.pos === cellPos);
}

function tableSize(view: EditorView): { width: number; height: number } {
  let table: ProseMirrorNode | null = null;
  view.state.doc.descendants((node) => {
    if (node.type.name !== "table") return true;
    table = node;
    return false;
  });

  if (!table) throw new Error("Missing table");
  const map = TableMap.get(table);
  return { width: map.width, height: map.height };
}

describe("table keyboard helpers", () => {
  it("moves to the next table cell", () => {
    const { host, view } = mountEditor(tableDoc());
    setCursorInCell(view, 0);

    expect(goToNextCellOrCreateRowForTest(1)(view.state, view.dispatch, view)).toBe(true);
    expect(selectedCellIndex(view)).toBe(1);

    host.remove();
  });

  it("moves to the previous table cell", () => {
    const { host, view } = mountEditor(tableDoc());
    setCursorInCell(view, 2);

    expect(goToNextCellOrCreateRowForTest(-1)(view.state, view.dispatch, view)).toBe(true);
    expect(selectedCellIndex(view)).toBe(1);

    host.remove();
  });

  it("adds a row when tabbing forward from the last cell", () => {
    const { host, view } = mountEditor(tableDoc());
    setCursorInCell(view, 3);

    expect(tableSize(view)).toEqual({ width: 2, height: 2 });
    expect(goToNextCellOrCreateRowForTest(1)(view.state, view.dispatch, view)).toBe(true);

    expect(tableSize(view)).toEqual({ width: 2, height: 3 });
    expect(selectedCellIndex(view)).toBe(4);

    host.remove();
  });

  it("reuses a following paragraph when exiting the table", () => {
    const { editor, host, view } = mountEditor(tableDoc({ trailingParagraph: "after" }));
    setCursorInCell(view, 0);

    expect(exitTableToParagraphForTest()(view.state, view.dispatch, view)).toBe(true);

    expect(editor.getDocJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeaderCell",
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "h1" }] }],
                },
                {
                  type: "tableHeaderCell",
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "h2" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "a1" }] }],
                },
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "a2" }] }],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "after" }],
        },
      ],
    });
    expect(view.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(view.state.selection.$from.parent.textContent).toBe("after");
    expect(view.state.selection.$from.parentOffset).toBe(0);

    host.remove();
  });

  it("creates a paragraph when exiting a terminal table", () => {
    const { editor, host, view } = mountEditor(tableDoc());
    setCursorInCell(view, 0);

    expect(exitTableToParagraphForTest()(view.state, view.dispatch, view)).toBe(true);

    const doc = editor.getDocJSON() as { content: { type: string }[] };
    expect(doc.content.at(-1)).toEqual({ type: "paragraph" });
    expect(view.state.selection.$from.parent.type.name).toBe("paragraph");

    host.remove();
  });

  it("selects the whole table as a cell selection", () => {
    const { editor, host, view } = mountEditor(tableDoc());
    setCursorInCell(view, 0);

    expect(view.state.selection instanceof CellSelection).toBe(false);
    (editor.commands as unknown as { selectTable: () => void }).selectTable();
    expect(view.state.selection instanceof CellSelection).toBe(true);

    host.remove();
  });

  it("selects the table node so delete removes the table", () => {
    const { editor, host, view } = mountEditor({
      type: "doc",
      content: [paragraph("before"), ...tableDoc().content, paragraph("after")],
    });
    setCursorInCell(view, 0);

    expect(selectTableNodeForTest()(view.state, view.dispatch, view)).toBe(true);

    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect(view.state.selection.from).toBe(paragraph("before").content[0].text.length + 2);

    view.dispatch(view.state.tr.deleteSelection());

    expect(editor.getDocJSON()).toEqual({
      type: "doc",
      content: [paragraph("before"), paragraph("after")],
    });

    host.remove();
  });
});
