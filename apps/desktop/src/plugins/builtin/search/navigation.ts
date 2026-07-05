import type { Editor } from "prosekit/core";
import { TextSelection } from "prosekit/pm/state";
import { createSignal } from "solid-js";

import { getActiveEditorInstance } from "~/components/editor/system/editor_engine";
import { getActiveTab, openTab } from "~/stores/files";

import type { SimpleSearchHit } from "../core_indexer/types";
import { fileNameFromPath } from "./search_results";

interface PendingSearchNavigation {
  filePath: string;
  sectionPath: string[];
  sectionOrdinal: number;
}

interface HeadingEntry {
  level: number;
  text: string;
  pos: number;
}

interface ApplyPendingSearchNavigationOptions {
  clearOnMiss?: boolean;
}

const [getPendingSearchNavigation, setPendingSearchNavigation] =
  createSignal<PendingSearchNavigation | null>(null);

function clearPendingSearchNavigation(): void {
  setPendingSearchNavigation(null);
}

function queuePendingSearchNavigation(hit: SimpleSearchHit): void {
  setPendingSearchNavigation({
    filePath: hit.docId,
    sectionPath: [...hit.sectionPath],
    sectionOrdinal: hit.sectionOrdinal,
  });
}

function findSectionHeadingPosition(
  headings: HeadingEntry[],
  sectionPath: string[],
  sectionOrdinal = 0,
): number | null {
  if (sectionPath.length === 0) {
    return 1;
  }

  const headingStack: HeadingEntry[] = [];
  let matchedOrdinal = 0;
  for (const heading of headings) {
    while (headingStack.length >= heading.level) {
      headingStack.pop();
    }
    headingStack.push(heading);
    if (
      headingStack.length === sectionPath.length &&
      headingStack.every((entry, index) => entry.text === sectionPath[index])
    ) {
      if (matchedOrdinal === sectionOrdinal) {
        return heading.pos;
      }
      matchedOrdinal += 1;
    }
  }

  return null;
}

function collectHeadingEntries(editor: Editor): HeadingEntry[] {
  const headings: HeadingEntry[] = [];

  editor.view.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") {
      return undefined;
    }

    headings.push({
      level: Number(node.attrs.level ?? 1),
      text: node.textContent.trim(),
      pos: pos + 1,
    });
    return undefined;
  });

  return headings;
}

function moveEditorSelection(editor: Editor, position: number): void {
  const maxPosition = Math.max(1, editor.view.state.doc.content.size);
  const target = Math.max(1, Math.min(position, maxPosition));
  const tr = editor.view.state.tr;
  tr.setSelection(TextSelection.near(tr.doc.resolve(target), 1));
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
}

function applyPendingSearchNavigation(
  editor: Editor,
  filePath: string,
  options: ApplyPendingSearchNavigationOptions = {},
): boolean {
  const pending = getPendingSearchNavigation();
  if (!pending || pending.filePath !== filePath) {
    return false;
  }

  if (pending.sectionPath.length === 0) {
    clearPendingSearchNavigation();
    moveEditorSelection(editor, 1);
    return true;
  }

  const position = findSectionHeadingPosition(
    collectHeadingEntries(editor),
    pending.sectionPath,
    pending.sectionOrdinal,
  );
  if (position === null) {
    if (options.clearOnMiss) {
      clearPendingSearchNavigation();
      moveEditorSelection(editor, 1);
    }
    return false;
  }

  clearPendingSearchNavigation();
  moveEditorSelection(editor, position);
  return true;
}

function openSearchHit(hit: SimpleSearchHit): void {
  const currentFilePath = getActiveTab()?.filePath;
  queuePendingSearchNavigation(hit);
  openTab(fileNameFromPath(hit.docId), hit.docId, "editor");

  const editor = currentFilePath === hit.docId ? getActiveEditorInstance() : null;
  if (editor !== null) {
    applyPendingSearchNavigation(editor, hit.docId);
  }
}

export {
  applyPendingSearchNavigation,
  clearPendingSearchNavigation,
  findSectionHeadingPosition,
  getPendingSearchNavigation,
  openSearchHit,
  queuePendingSearchNavigation,
};
