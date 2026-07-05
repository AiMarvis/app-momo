import { getMarkdownService } from "~/plugins/markdown_service";
import { registerDiff } from "~/stores/diff_store";
import { openTab } from "~/stores/files";

import { buildDiffDocument } from "./diff_document";
import { defineDiffSchemaExtension, defineReadonly } from "./nodes/diff_block";

function baseName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function openDiffView(sourceFilePath: string, oldMarkdown: string, newMarkdown: string): void {
  const markdown = getMarkdownService();
  if (!markdown) {
    return;
  }

  const oldDoc = markdown.parse(oldMarkdown);
  const newDoc = markdown.parse(newMarkdown);
  const diffDoc = buildDiffDocument(oldDoc, newDoc);
  const diffTabPath = registerDiff(sourceFilePath, oldMarkdown, newMarkdown, diffDoc);

  openTab(`Diff: ${baseName(sourceFilePath)}`, diffTabPath, "diff");
}

export { defineDiffSchemaExtension, defineReadonly, openDiffView };
