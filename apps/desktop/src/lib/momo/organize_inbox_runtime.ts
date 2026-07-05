import type { ChecksumWriteResult, FileEntry, FileReadResult } from "~/lib/vault_types";

import { buildAgentReceipt, type AgentReceipt } from "./agent_receipt";
import {
  runAgentProviderAdapters,
  type CodexPlanAdapter,
  type OpenAiFallbackApprovalRequest,
  type OpenAiPlanAdapter,
} from "./agent_provider_adapters";
import type { AgentPlan } from "./agent_plan_types";
import {
  createdFilePaths,
  markdownForCreate,
  organizedInto,
  processedSourceMarkdown,
  receiptMarkdown,
  runLogMarkdown,
  safeTimestamp,
  undoPlanMarkdown,
} from "./organize_inbox_markdown";

interface OrganizeInboxVault {
  exists(path: string): Promise<boolean>;
  listDirectory?(path: string): Promise<readonly FileEntry[]>;
  mkdir(path: string): Promise<void>;
  readFileWithChecksum(path: string): Promise<FileReadResult>;
  writeFile(path: string, content: string): Promise<void>;
  writeFileWithChecksum(
    path: string,
    content: string,
    checksum: string,
  ): Promise<ChecksumWriteResult>;
}

type OrganizeInboxResult =
  | {
      readonly status: "applied";
      readonly receipt: AgentReceipt;
      readonly runLogPath: string;
      readonly changeReceiptPath: string;
      readonly undoPlanPath: string;
    }
  | { readonly status: "invalid_plan"; readonly errors: readonly string[] }
  | { readonly status: "blocked_approval_required"; readonly errors: readonly string[] }
  | { readonly status: "rejected_selection"; readonly errors: readonly string[] }
  | { readonly status: "source_conflict"; readonly errors: readonly string[] };

interface OrganizeSelectedInboxNotesInput {
  readonly selectedPaths: readonly string[];
  readonly vault: OrganizeInboxVault;
  readonly codex: CodexPlanAdapter;
  readonly openai: OpenAiPlanAdapter;
  readonly askOpenAiFallbackApproval: (request: OpenAiFallbackApprovalRequest) => Promise<boolean>;
  readonly nowIso?: () => string;
  readonly timeoutMs?: number;
}

const APPROVAL_BLOCKED_ERRORS = [
  "Approval-required changes are not applied in this Organize Inbox slice",
] as const;
const RELATED_OUTPUT_ROOTS = ["Tasks", "Build", "Projects", "Calendar", "Planning"] as const;
const RELATED_OUTPUT_LIMIT = 6;
const RELATED_OUTPUT_SCAN_LIMIT = 40;
const RELATED_OUTPUT_SNIPPET_CHARS = 1200;

async function organizeSelectedInboxNotes(
  input: OrganizeSelectedInboxNotesInput,
): Promise<OrganizeInboxResult> {
  if (input.selectedPaths.length !== 1 || !isInboxMarkdown(input.selectedPaths[0])) {
    return {
      status: "rejected_selection",
      errors: ["Organize Inbox processes exactly one Inbox Note"],
    };
  }

  const sourceNote = input.selectedPaths[0];
  const source = await input.vault.readFileWithChecksum(sourceNote);
  const relatedOutputs = await relatedOutputsFor(input.vault, sourceNote);
  const validation = await runAgentProviderAdapters({
    sourceNote,
    sourceMarkdown: source.content,
    relatedOutputs,
    codex: input.codex,
    openai: input.openai,
    askOpenAiFallbackApproval: input.askOpenAiFallbackApproval,
    nowIso: input.nowIso,
    timeoutMs: input.timeoutMs,
  });

  if (validation.kind === "invalid") {
    return { status: "invalid_plan", errors: validation.errors };
  }
  if (validation.approvalRequired.length > 0) {
    return { status: "blocked_approval_required", errors: APPROVAL_BLOCKED_ERRORS };
  }

  return applySafePlan({
    plan: validation.plan,
    source,
    vault: input.vault,
    nowIso: input.nowIso?.() ?? new Date().toISOString(),
  });
}

async function applySafePlan(input: {
  readonly plan: AgentPlan;
  readonly source: FileReadResult;
  readonly vault: OrganizeInboxVault;
  readonly nowIso: string;
}): Promise<OrganizeInboxResult> {
  const runStem = `.AgentRuns/organize-inbox-${safeTimestamp(input.nowIso)}`;
  const runLogPath = `${runStem}-run.md`;
  const changeReceiptPath = `${runStem}-receipt.md`;
  const undoPlanPath = `${runStem}-undo.md`;
  const receipt = buildAgentReceipt({
    kind: "applied",
    plan: input.plan,
    runLogPath,
    undoPlanPath,
  });

  for (const path of createdFilePaths(input.plan)) {
    if (await input.vault.exists(path)) {
      return { status: "invalid_plan", errors: [`create path already exists: ${path}`] };
    }
  }

  const sourceWrite = await input.vault.writeFileWithChecksum(
    input.plan.sourceNote,
    processedSourceMarkdown({
      sourceMarkdown: input.source.content,
      runLogPath,
      organizedInto: organizedInto(input.plan),
    }),
    input.source.checksum,
  );
  if (sourceWrite.status === "Conflict") {
    return {
      status: "source_conflict",
      errors: [`source note changed before apply: ${input.plan.sourceNote}`],
    };
  }

  await ensureParentDirs(input.vault, runLogPath);
  for (const create of input.plan.creates) {
    if (create.kind !== "note_link") {
      await ensureParentDirs(input.vault, create.path);
      await input.vault.writeFile(create.path, markdownForCreate(create));
    }
  }

  await input.vault.writeFile(runLogPath, runLogMarkdown(input.plan, input.nowIso));
  await input.vault.writeFile(changeReceiptPath, receiptMarkdown(receipt));
  await input.vault.writeFile(undoPlanPath, undoPlanMarkdown(input.plan, runLogPath));

  return { status: "applied", receipt, runLogPath, changeReceiptPath, undoPlanPath };
}

async function relatedOutputsFor(
  vault: OrganizeInboxVault,
  sourceNote: string,
): Promise<readonly string[]> {
  if (!hasListDirectory(vault)) return [];

  const paths = await relatedOutputPaths(vault);
  const outputs: string[] = [];
  for (const path of paths.slice(0, RELATED_OUTPUT_SCAN_LIMIT)) {
    const read = await readOptional(vault, path);
    if (read === null || !read.content.includes(sourceNote)) continue;

    outputs.push(formatRelatedOutput(path, read.content));
    if (outputs.length >= RELATED_OUTPUT_LIMIT) break;
  }
  return outputs;
}

async function relatedOutputPaths(
  vault: Pick<OrganizeInboxVault, "exists"> & Required<Pick<OrganizeInboxVault, "listDirectory">>,
) {
  const paths = new Set<string>();
  for (const root of RELATED_OUTPUT_ROOTS) {
    if (!(await existsOptional(vault, root))) continue;
    for (const entry of flattenEntries(await vault.listDirectory(root))) {
      if (!entry.is_directory && entry.path.endsWith(".md")) paths.add(entry.path);
    }
  }
  return [...paths].sort((left, right) => left.localeCompare(right));
}

async function existsOptional(vault: Pick<OrganizeInboxVault, "exists">, path: string) {
  try {
    return await vault.exists(path);
  } catch {
    return false;
  }
}

async function readOptional(
  vault: Pick<OrganizeInboxVault, "readFileWithChecksum">,
  path: string,
): Promise<FileReadResult | null> {
  try {
    return await vault.readFileWithChecksum(path);
  } catch {
    return null;
  }
}

function flattenEntries(entries: readonly FileEntry[]): readonly FileEntry[] {
  return entries.flatMap((entry) => [
    entry,
    ...(entry.children === undefined ? [] : flattenEntries(entry.children)),
  ]);
}

function formatRelatedOutput(path: string, content: string): string {
  return [`Path: ${path}`, content.trim().slice(0, RELATED_OUTPUT_SNIPPET_CHARS)].join("\n\n");
}

function hasListDirectory(
  vault: OrganizeInboxVault,
): vault is OrganizeInboxVault & Required<Pick<OrganizeInboxVault, "listDirectory">> {
  return vault.listDirectory !== undefined;
}

async function ensureParentDirs(vault: Pick<OrganizeInboxVault, "exists" | "mkdir">, path: string) {
  const directories = parentDirs(path);
  for (const directory of directories) {
    if (!(await vault.exists(directory))) await vault.mkdir(directory);
  }
}

function parentDirs(path: string): readonly string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

function isInboxMarkdown(path: string | undefined): path is string {
  return typeof path === "string" && path.startsWith("Inbox/") && path.endsWith(".md");
}

export { organizeSelectedInboxNotes };
export type { OrganizeInboxResult, OrganizeInboxVault, OrganizeSelectedInboxNotesInput };
