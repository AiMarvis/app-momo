import type { PMMarkJSON, PMNodeJSON } from "~/lib/markdown";

type SequenceSegmentType = "equal" | "insert" | "delete";

interface InlineTextToken {
  kind: "text";
  text: string;
  marks?: PMMarkJSON[];
}

interface InlineNodeToken {
  kind: "node";
  node: PMNodeJSON;
}

type InlineToken = InlineTextToken | InlineNodeToken;

interface SequenceSegment<T> {
  type: SequenceSegmentType;
  values: T[];
}

type BlockDiff =
  | { type: "unchanged"; block: PMNodeJSON }
  | { type: "added"; block: PMNodeJSON }
  | { type: "removed"; block: PMNodeJSON }
  | { type: "modified"; oldBlock: PMNodeJSON; newBlock: PMNodeJSON };

function serializeValue(value: unknown): string {
  return JSON.stringify(value);
}

function blocksEqual(left: PMNodeJSON, right: PMNodeJSON): boolean {
  return serializeValue(left) === serializeValue(right);
}

function lcsLength<T>(left: T[], right: T[], isEqual: (a: T, b: T) => boolean): number {
  const leftLength = left.length;
  const rightLength = right.length;
  const score = Array.from({ length: leftLength + 1 }, () =>
    Array<number>(rightLength + 1).fill(0),
  );

  for (let leftIndex = leftLength - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = rightLength - 1; rightIndex >= 0; rightIndex -= 1) {
      score[leftIndex][rightIndex] = isEqual(left[leftIndex], right[rightIndex])
        ? 1 + score[leftIndex + 1][rightIndex + 1]
        : Math.max(score[leftIndex + 1][rightIndex], score[leftIndex][rightIndex + 1]);
    }
  }

  return score[0][0];
}

function canInlineDiff(left: PMNodeJSON, right: PMNodeJSON): boolean {
  if (left.type !== right.type) {
    return false;
  }

  if (left.type !== "paragraph" && left.type !== "heading") {
    return false;
  }

  const leftTokens = tokenizeInlineContent(left.content);
  const rightTokens = tokenizeInlineContent(right.content);
  const longestLength = Math.max(leftTokens.length, rightTokens.length);
  if (longestLength === 0) {
    return true;
  }

  const similarity = lcsLength(leftTokens, rightTokens, inlineTokensEqual) / longestLength;
  return similarity >= 0.5;
}

function diffBlocks(oldBlocks: PMNodeJSON[], newBlocks: PMNodeJSON[]): BlockDiff[] {
  const oldLength = oldBlocks.length;
  const newLength = newBlocks.length;
  const cost = Array.from({ length: oldLength + 1 }, () => Array<number>(newLength + 1).fill(0));

  for (let oldIndex = oldLength - 1; oldIndex >= 0; oldIndex -= 1) {
    cost[oldIndex][newLength] = oldLength - oldIndex;
  }

  for (let newIndex = newLength - 1; newIndex >= 0; newIndex -= 1) {
    cost[oldLength][newIndex] = newLength - newIndex;
  }

  for (let oldIndex = oldLength - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLength - 1; newIndex >= 0; newIndex -= 1) {
      const oldBlock = oldBlocks[oldIndex];
      const newBlock = newBlocks[newIndex];
      const deleteCost = 1 + cost[oldIndex + 1][newIndex];
      const insertCost = 1 + cost[oldIndex][newIndex + 1];
      let best = Math.min(deleteCost, insertCost);

      if (blocksEqual(oldBlock, newBlock)) {
        best = Math.min(best, cost[oldIndex + 1][newIndex + 1]);
      } else if (canInlineDiff(oldBlock, newBlock)) {
        best = Math.min(best, 1 + cost[oldIndex + 1][newIndex + 1]);
      }

      cost[oldIndex][newIndex] = best;
    }
  }

  const result: BlockDiff[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLength || newIndex < newLength) {
    if (oldIndex >= oldLength) {
      result.push({ type: "added", block: newBlocks[newIndex] });
      newIndex += 1;
      continue;
    }

    if (newIndex >= newLength) {
      result.push({ type: "removed", block: oldBlocks[oldIndex] });
      oldIndex += 1;
      continue;
    }

    const oldBlock = oldBlocks[oldIndex];
    const newBlock = newBlocks[newIndex];

    if (
      blocksEqual(oldBlock, newBlock) &&
      cost[oldIndex][newIndex] === cost[oldIndex + 1][newIndex + 1]
    ) {
      result.push({ type: "unchanged", block: oldBlock });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }

    if (
      canInlineDiff(oldBlock, newBlock) &&
      cost[oldIndex][newIndex] === 1 + cost[oldIndex + 1][newIndex + 1]
    ) {
      result.push({ type: "modified", oldBlock, newBlock });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }

    if (cost[oldIndex][newIndex] === 1 + cost[oldIndex + 1][newIndex]) {
      result.push({ type: "removed", block: oldBlock });
      oldIndex += 1;
      continue;
    }

    result.push({ type: "added", block: newBlock });
    newIndex += 1;
  }

  return result;
}

function tokenizeInlineContent(content: PMNodeJSON[] = []): InlineToken[] {
  const tokens: InlineToken[] = [];

  for (const node of content) {
    if (node.type === "text") {
      for (const char of node.text ?? "") {
        tokens.push({
          kind: "text",
          text: char,
          marks: node.marks ? [...node.marks] : undefined,
        });
      }
      continue;
    }

    tokens.push({
      kind: "node",
      node,
    });
  }

  return tokens;
}

function inlineTokensEqual(left: InlineToken, right: InlineToken): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "text" && right.kind === "text") {
    return (
      left.text === right.text &&
      serializeValue(left.marks ?? []) === serializeValue(right.marks ?? [])
    );
  }

  if (left.kind === "node" && right.kind === "node") {
    return serializeValue(left.node) === serializeValue(right.node);
  }

  return false;
}

function diffInlineTokens(
  oldTokens: InlineToken[],
  newTokens: InlineToken[],
): SequenceSegment<InlineToken>[] {
  const oldLength = oldTokens.length;
  const newLength = newTokens.length;
  const score = Array.from({ length: oldLength + 1 }, () => Array<number>(newLength + 1).fill(0));

  for (let oldIndex = oldLength - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLength - 1; newIndex >= 0; newIndex -= 1) {
      score[oldIndex][newIndex] = inlineTokensEqual(oldTokens[oldIndex], newTokens[newIndex])
        ? 1 + score[oldIndex + 1][newIndex + 1]
        : Math.max(score[oldIndex + 1][newIndex], score[oldIndex][newIndex + 1]);
    }
  }

  const segments: SequenceSegment<InlineToken>[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  function push(type: SequenceSegmentType, value: InlineToken): void {
    const last = segments.at(-1);
    if (last?.type === type) {
      last.values.push(value);
      return;
    }
    segments.push({ type, values: [value] });
  }

  while (oldIndex < oldLength && newIndex < newLength) {
    if (inlineTokensEqual(oldTokens[oldIndex], newTokens[newIndex])) {
      push("equal", oldTokens[oldIndex]);
      oldIndex += 1;
      newIndex += 1;
      continue;
    }

    if (score[oldIndex + 1][newIndex] >= score[oldIndex][newIndex + 1]) {
      push("delete", oldTokens[oldIndex]);
      oldIndex += 1;
      continue;
    }

    push("insert", newTokens[newIndex]);
    newIndex += 1;
  }

  while (oldIndex < oldLength) {
    push("delete", oldTokens[oldIndex]);
    oldIndex += 1;
  }

  while (newIndex < newLength) {
    push("insert", newTokens[newIndex]);
    newIndex += 1;
  }

  return segments;
}

export { diffBlocks, diffInlineTokens, tokenizeInlineContent };
export type { BlockDiff, InlineToken, SequenceSegment };
