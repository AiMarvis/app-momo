import { batch } from "solid-js";

import { parseMomoDomainNote } from "~/lib/momo/domain_frontmatter";

interface InboxCaptureVault {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
}

type InboxCaptureResult =
  | { readonly status: "created"; readonly path: string; readonly body: string }
  | { readonly status: "empty" };

type InboxAgentState =
  | { readonly kind: "empty" }
  | { readonly kind: "batch_unavailable"; readonly count: number }
  | { readonly kind: "not_inbox"; readonly path: string }
  | { readonly kind: "ready"; readonly path: string }
  | { readonly kind: "processed"; readonly path: string; readonly agentRun: string }
  | { readonly kind: "invalid"; readonly path: string; readonly issues: readonly string[] };

function assertNever(_value: never): never {
  throw new Error("Unhandled Momo domain note");
}

const INBOX_DIR = "Inbox";
const MAX_BASENAME_LENGTH = 56;

function cleanCaptureBody(text: string): string | null {
  return text.trim().length > 0 ? text : null;
}

function firstContentLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .find((line) => line.trim().length > 0)
      ?.trim() ?? "inbox-note"
  );
}

function sanitizeBasename(text: string): string {
  const ascii = firstContentLine(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_BASENAME_LENGTH)
    .replace(/-+$/g, "");

  return ascii.length > 0 ? ascii : "inbox-note";
}

async function nextInboxPath(body: string, vault: InboxCaptureVault): Promise<string> {
  const basename = sanitizeBasename(body);
  let counter = 1;

  while (true) {
    const suffix = counter === 1 ? "" : `-${counter}`;
    const path = `${INBOX_DIR}/${basename}${suffix}.md`;
    if (!(await vault.exists(path))) return path;
    counter += 1;
  }
}

async function captureInboxNoteWithVault(
  text: string,
  vault: InboxCaptureVault,
): Promise<InboxCaptureResult> {
  const body = cleanCaptureBody(text);
  if (body === null) return { status: "empty" };

  if (!(await vault.exists(INBOX_DIR))) {
    await vault.mkdir(INBOX_DIR);
  }

  const path = await nextInboxPath(body, vault);
  await vault.writeFile(path, body);
  return { status: "created", path, body };
}

async function captureInboxNote(text: string): Promise<InboxCaptureResult> {
  const vaultStore = await import("~/stores/vault");
  const { vaultMkdir } = await import("~/lib/vault_fs");
  const appVault: InboxCaptureVault = {
    exists: vaultStore.exists,
    mkdir: vaultMkdir,
    readFile: vaultStore.readFile,
    writeFile: vaultStore.writeFile,
  };
  const result = await captureInboxNoteWithVault(text, appVault);
  if (result.status !== "created") return result;

  const root = vaultStore.vaultState.rootPath;
  if (root) {
    await vaultStore.loadFiles(root);
  }

  const { openTab } = await import("~/stores/files");
  batch(() => {
    vaultStore.expandFolder(INBOX_DIR);
    vaultStore.revealPath(result.path);
    vaultStore.setSelectedPath(result.path);
    openTab(result.path.split("/").at(-1) ?? result.path, result.path, "editor");
  });

  return result;
}

async function getInboxAgentState(
  selectedPaths: readonly string[],
  vault?: Pick<InboxCaptureVault, "readFile">,
): Promise<InboxAgentState> {
  if (selectedPaths.length === 0) return { kind: "empty" };
  if (selectedPaths.length > 1) return { kind: "batch_unavailable", count: selectedPaths.length };

  const path = selectedPaths[0];
  if (!path.startsWith(`${INBOX_DIR}/`)) return { kind: "not_inbox", path };

  const reader = vault ?? (await import("~/stores/vault"));
  const markdown = await reader.readFile(path);
  const note = parseMomoDomainNote(path, markdown);
  switch (note.kind) {
    case "inbox_note":
      return { kind: "ready", path };
    case "processed_inbox_note":
      return { kind: "processed", path, agentRun: note.agentRun };
    case "invalid":
      return { kind: "invalid", path, issues: note.issues };
    case "none":
    case "project":
    case "task":
    case "issue":
    case "schedule_block":
    case "planning_candidate":
    case "run_log":
      return { kind: "not_inbox", path };
    default:
      return assertNever(note);
  }
}

export { captureInboxNote, captureInboxNoteWithVault, getInboxAgentState, sanitizeBasename };
export type { InboxAgentState, InboxCaptureResult, InboxCaptureVault };
