import type { PMMarkJSON, PMNodeJSON } from "~/lib/markdown";

import { diffBlocks, diffInlineTokens, tokenizeInlineContent } from "./diff_engine";

function cloneNode<T>(value: T): T {
  return structuredClone(value);
}

function sameMarks(left: PMMarkJSON[] | undefined, right: PMMarkJSON[] | undefined): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function appendDiffMark(
  marks: PMMarkJSON[] | undefined,
  diffType: "diffAdded" | "diffRemoved",
): PMMarkJSON[] {
  const next = marks ? [...marks] : [];
  if (!next.some((mark) => mark.type === diffType)) {
    next.push({ type: diffType });
  }
  return next;
}

function pushTextNode(nodes: PMNodeJSON[], text: string, marks: PMMarkJSON[] | undefined): void {
  if (text.length === 0) {
    return;
  }

  const last = nodes.at(-1);
  if (last?.type === "text" && sameMarks(last.marks, marks)) {
    last.text = `${last.text ?? ""}${text}`;
    return;
  }

  const node: PMNodeJSON = { type: "text", text };
  if (marks && marks.length > 0) {
    node.marks = marks;
  }
  nodes.push(node);
}

function buildInlineDiffContent(
  oldContent: PMNodeJSON[] | undefined,
  newContent: PMNodeJSON[] | undefined,
): PMNodeJSON[] | null {
  const oldTokens = tokenizeInlineContent(oldContent);
  const newTokens = tokenizeInlineContent(newContent);
  const segments = diffInlineTokens(oldTokens, newTokens);
  const result: PMNodeJSON[] = [];

  for (const segment of segments) {
    for (const token of segment.values) {
      if (token.kind === "node") {
        if (segment.type !== "equal") {
          return null;
        }
        result.push(cloneNode(token.node));
        continue;
      }

      let marks = token.marks;
      if (segment.type === "delete") {
        marks = appendDiffMark(token.marks, "diffRemoved");
      } else if (segment.type === "insert") {
        marks = appendDiffMark(token.marks, "diffAdded");
      }

      pushTextNode(result, token.text, marks);
    }
  }

  return result;
}

function buildModifiedBlock(oldBlock: PMNodeJSON, newBlock: PMNodeJSON): PMNodeJSON | null {
  if (oldBlock.type !== newBlock.type) {
    return null;
  }

  if (oldBlock.type !== "paragraph" && oldBlock.type !== "heading") {
    return null;
  }

  const content = buildInlineDiffContent(oldBlock.content, newBlock.content);
  if (content === null) {
    return null;
  }

  const block = cloneNode(newBlock);
  if (content.length > 0) {
    block.content = content;
  } else {
    delete block.content;
  }
  return block;
}

function createDiffWrapper(
  diffType: "unchanged" | "added" | "removed" | "modified",
  blocks: PMNodeJSON[],
): PMNodeJSON {
  return {
    type: "diffBlock",
    attrs: { diffType },
    content: blocks,
  };
}

function buildDiffDocument(oldDoc: PMNodeJSON, newDoc: PMNodeJSON): PMNodeJSON {
  const oldBlocks = oldDoc.content ?? [];
  const newBlocks = newDoc.content ?? [];
  const content: PMNodeJSON[] = [];

  for (const blockDiff of diffBlocks(oldBlocks, newBlocks)) {
    if (blockDiff.type === "modified") {
      const modifiedBlock = buildModifiedBlock(blockDiff.oldBlock, blockDiff.newBlock);
      if (modifiedBlock) {
        content.push(createDiffWrapper("modified", [modifiedBlock]));
      } else {
        content.push(createDiffWrapper("removed", [cloneNode(blockDiff.oldBlock)]));
        content.push(createDiffWrapper("added", [cloneNode(blockDiff.newBlock)]));
      }
      continue;
    }

    content.push(createDiffWrapper(blockDiff.type, [cloneNode(blockDiff.block)]));
  }

  if (content.length === 0) {
    content.push(
      createDiffWrapper("unchanged", [
        {
          type: "paragraph",
        },
      ]),
    );
  }

  return {
    type: "doc",
    content,
  };
}

export { buildDiffDocument };
