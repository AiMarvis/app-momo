import { createMemo, createSignal, For, onMount, Show } from "solid-js";

import { EyeIcon, SearchIcon } from "~/components/icons/general_icons";
import { listDirectory, readFile } from "~/lib/vault_fs";
import type { FileEntry } from "~/lib/vault_types";
import GraphCanvas from "~/plugins/builtin/graph_view/graph_canvas_pixi";
import type { GraphNode } from "~/plugins/builtin/graph_view/graph_types";
import { editorState } from "~/stores/editor";
import { openTab } from "~/stores/files";

import {
  deriveContextQuery,
  hasRecoveryWarning,
  isInboxDecisionStatus,
  parseApplyJournalSummary,
  parseDecisionDocumentSummary,
  parseMemorySummary,
  parseWikiSummary,
  sortApplyJournals,
  sortDecisionDocuments,
  sortRecentMemory,
  sortRecentWiki,
  type ApplyJournalSummary,
  type DecisionDocumentSummary,
  type MemorySummary,
  type WikiSummary,
} from "../knowledge_panel_data";
import { createKnowledgeService } from "../service";
import type {
  KnowledgeContextResult,
  KnowledgeCommandResult,
  KnowledgeStatusResult,
  MemorySearchHit,
  WikiSearchHit,
} from "../types";

const BUTTON =
  "inline-flex h-7 items-center justify-center gap-1.5 rounded-xs border border-border bg-bg-secondary px-2 text-[0.6875rem] font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50";
const SECTION = "rounded-xs border border-border bg-bg-primary/60";
const SECTION_HEADER =
  "flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2";
const INPUT =
  "h-7 min-w-0 flex-1 rounded-xs border border-border bg-bg-primary px-2 text-[0.6875rem] text-text-primary outline-none placeholder:text-text-muted focus:border-accent";

const STATUS_ITEMS: { key: keyof KnowledgeStatusResult; label: string }[] = [
  { key: "initialized", label: "Initialized" },
  { key: "root_exists", label: "Root" },
  { key: "memory_dir_exists", label: "Memory" },
  { key: "proposals_dir_exists", label: "Proposals" },
  { key: "decisions_dir_exists", label: "Decisions" },
  { key: "wiki_dir_exists", label: "Wiki" },
  { key: "cache_dir_exists", label: "Cache" },
];

type ContextHit = { kind: "memory"; hit: MemorySearchHit } | { kind: "wiki"; hit: WikiSearchHit };

function KnowledgePanel() {
  const service = createKnowledgeService();
  const [status, setStatus] = createSignal<KnowledgeStatusResult | null>(null);
  const [decisionDocs, setDecisionDocs] = createSignal<DecisionDocumentSummary[]>([]);
  const [recentMemory, setRecentMemory] = createSignal<MemorySummary[]>([]);
  const [recentWiki, setRecentWiki] = createSignal<WikiSummary[]>([]);
  const [applyJournals, setApplyJournals] = createSignal<ApplyJournalSummary[]>([]);
  const [contextQuery, setContextQuery] = createSignal("");
  const [contextResult, setContextResult] = createSignal<KnowledgeContextResult | null>(null);
  const [panelWarnings, setPanelWarnings] = createSignal<string[]>([]);
  const [busy, setBusy] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const isBusy = () => busy() !== null;
  const inboxDocs = createMemo(() =>
    decisionDocs()
      .filter((doc) => isInboxDecisionStatus(doc.status))
      .slice(0, 8),
  );
  const recoveryJournals = createMemo(() => applyJournals().filter(hasRecoveryWarning).slice(0, 5));
  const contextHits = createMemo<ContextHit[]>(() => [
    ...(contextResult()?.memory_hits ?? []).map((hit) => ({ kind: "memory" as const, hit })),
    ...(contextResult()?.wiki_hits ?? []).map((hit) => ({ kind: "wiki" as const, hit })),
  ]);
  const warningCount = createMemo(
    () =>
      panelWarnings().length + recoveryJournals().length + (contextResult()?.warnings.length ?? 0),
  );

  async function refreshPanelData(): Promise<void> {
    setBusy("knowledge_status");
    setError(null);
    const warnings: string[] = [];

    try {
      const statusResult = await service.status();
      if (statusResult.ok) {
        setStatus(statusResult.value);
      } else {
        warnings.push(formatCommandError(statusResult));
      }

      const [docs, memories, wikiPages, journals] = await Promise.all([
        loadDecisionDocuments(warnings),
        loadRecentMemory(warnings),
        loadRecentWiki(warnings),
        loadApplyJournals(warnings),
      ]);

      setDecisionDocs(docs);
      setRecentMemory(memories);
      setRecentWiki(wikiPages);
      setApplyJournals(journals);
      setPanelWarnings(warnings);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setBusy(null);
    }
  }

  async function refreshContext(): Promise<void> {
    const query = contextQuery().trim() || deriveContextQuery(editorState.filePath);
    if (!query) {
      setContextResult(null);
      return;
    }

    setBusy("knowledge_context");
    setError(null);
    try {
      const result = await service.knowledgeContext({
        query,
        active_path: editorState.filePath ?? undefined,
        limit: 5,
        include: ["memory", "wiki"],
      });
      if (result.ok) {
        setContextResult(result.value);
      } else {
        setError(formatCommandError(result));
      }
    } catch (contextError) {
      setError(contextError instanceof Error ? contextError.message : String(contextError));
    } finally {
      setBusy(null);
    }
  }

  onMount(() => {
    void refreshPanelData();
    void refreshContext();
  });

  return (
    <section class="flex h-full min-h-0 flex-col bg-bg-secondary/60 text-sm">
      <header class="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-bg-primary/50 px-3 py-2">
        <h2 class="min-w-0 truncate text-[0.75rem] font-medium text-text-primary">Second Brain</h2>
        <button
          type="button"
          class={BUTTON}
          disabled={isBusy()}
          title="Refresh knowledge panel"
          onClick={() => void refreshPanelData()}
        >
          Status
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-auto p-3">
        <div class="flex flex-col gap-3">
          <KnowledgeGraphSection />

          <section class={SECTION}>
            <div class={SECTION_HEADER}>
              <h3 class="text-[0.75rem] font-medium text-text-primary">Overview</h3>
              <Show when={busy()}>
                {(command) => (
                  <span class="rounded-xs border border-border bg-bg-secondary px-1.5 py-0.5 font-mono text-[0.625rem] text-text-muted">
                    {command()}
                  </span>
                )}
              </Show>
            </div>
            <div class="grid grid-cols-4 gap-2 p-3">
              <Metric label="Inbox" value={inboxDocs().length} />
              <Metric label="Memory" value={recentMemory().length} />
              <Metric label="Wiki" value={recentWiki().length} />
              <Metric
                label="Warnings"
                value={warningCount()}
                tone={warningCount() ? "warn" : "ok"}
              />
            </div>
          </section>

          <Show when={error()}>
            {(message) => (
              <p class="rounded-xs border border-error-border bg-error-bg px-2 py-1.5 text-[0.6875rem] text-error">
                {message()}
              </p>
            )}
          </Show>

          <WarningsSection
            warnings={panelWarnings()}
            journals={recoveryJournals()}
            contextWarnings={contextResult()?.warnings ?? []}
          />

          <section class={SECTION}>
            <div class={SECTION_HEADER}>
              <h3 class="text-[0.75rem] font-medium text-text-primary">Inbox</h3>
              <StatePill value={`${inboxDocs().length}`} />
            </div>
            <Show
              when={inboxDocs().length > 0}
              fallback={<EmptyLine text="No pending documents" />}
            >
              <div class="flex flex-col divide-y divide-border/60">
                <For each={inboxDocs()}>
                  {(doc) => (
                    <DocumentRow doc={doc} onOpen={() => openDocument(doc.path, doc.title)} />
                  )}
                </For>
              </div>
            </Show>
          </section>

          <section class={SECTION}>
            <div class={SECTION_HEADER}>
              <h3 class="text-[0.75rem] font-medium text-text-primary">Recent Memory</h3>
              <StatePill value={`${recentMemory().length}`} />
            </div>
            <Show
              when={recentMemory().length > 0}
              fallback={<EmptyLine text="No committed memory" />}
            >
              <div class="flex flex-col divide-y divide-border/60">
                <For each={recentMemory().slice(0, 6)}>
                  {(memory) => (
                    <MemoryRow
                      memory={memory}
                      onOpen={() => openDocument(memory.path, memory.title)}
                    />
                  )}
                </For>
              </div>
            </Show>
          </section>

          <section class={SECTION}>
            <div class={SECTION_HEADER}>
              <h3 class="text-[0.75rem] font-medium text-text-primary">Recent Wiki</h3>
              <StatePill value={`${recentWiki().length}`} />
            </div>
            <Show when={recentWiki().length > 0} fallback={<EmptyLine text="No committed wiki" />}>
              <div class="flex flex-col divide-y divide-border/60">
                <For each={recentWiki().slice(0, 6)}>
                  {(page) => (
                    <WikiRow page={page} onOpen={() => openDocument(page.path, page.title)} />
                  )}
                </For>
              </div>
            </Show>
          </section>

          <section class={SECTION}>
            <div class={SECTION_HEADER}>
              <h3 class="text-[0.75rem] font-medium text-text-primary">Context</h3>
              <button
                type="button"
                class={BUTTON}
                disabled={isBusy()}
                title="Refresh related memory"
                onClick={() => void refreshContext()}
              >
                <SearchIcon />
                Search
              </button>
            </div>
            <div class="flex gap-2 border-b border-border/60 p-3">
              <input
                class={INPUT}
                value={contextQuery()}
                placeholder={deriveContextQuery(editorState.filePath) || "Knowledge query"}
                onInput={(event) => setContextQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void refreshContext();
                  }
                }}
              />
            </div>
            <Show
              when={contextHits().length > 0}
              fallback={<EmptyLine text="No context results" />}
            >
              <div class="flex flex-col divide-y divide-border/60">
                <For each={contextHits()}>
                  {(hit) => (
                    <ContextRow
                      item={hit}
                      onOpen={() => openDocument(hit.hit.path, hit.hit.title)}
                    />
                  )}
                </For>
              </div>
            </Show>
          </section>

          <section class={SECTION}>
            <div class="border-b border-border/70 px-3 py-2">
              <h3 class="text-[0.75rem] font-medium text-text-primary">Status</h3>
            </div>
            <div class="flex flex-col divide-y divide-border/60">
              <For each={STATUS_ITEMS}>
                {(item) => (
                  <div class="flex items-center justify-between gap-3 px-3 py-2">
                    <span class="text-[0.6875rem] text-text-secondary">{item.label}</span>
                    <BooleanChip value={status()?.[item.key]} />
                  </div>
                )}
              </For>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function KnowledgeGraphSection() {
  return (
    <section class={SECTION}>
      <div class={SECTION_HEADER}>
        <h3 class="text-[0.75rem] font-medium text-text-primary">Knowledge Graph</h3>
        <StatePill value="2D" />
      </div>
      <div class="border-t border-border/60 bg-bg-primary">
        <div class="mx-auto aspect-4/3 max-h-[42vh] w-full max-w-[56vh] min-w-0 overflow-hidden">
          <GraphCanvas
            variant="compact"
            currentFilePath={editorState.filePath}
            nodeFilter={isKnowledgeInternalGraphNode}
            emptyTitle="No linked knowledge yet"
            emptyHint="Try connecting related memory, wiki, and decisions to grow this map."
            onNodeClick={(node) => openDocument(node.filePath, node.name)}
            initialShowClusters
            hideFollowControl
            hideZoomLabel
            class="size-full"
          />
        </div>
      </div>
    </section>
  );
}

function isKnowledgeInternalGraphNode(node: GraphNode): boolean {
  const path = node.filePath.replace(/\\/g, "/").toLowerCase();
  return (
    path.startsWith("knowledge/memory/") ||
    path.startsWith("knowledge/wiki/") ||
    path.startsWith("knowledge/decisions/")
  );
}

function Metric(props: { label: string; value: number; tone?: "ok" | "warn" }) {
  const toneClass = () =>
    props.tone === "warn"
      ? "border-warning-border bg-warning-bg text-warning"
      : "border-border bg-bg-secondary text-text-secondary";

  return (
    <div class={`rounded-xs border px-2 py-1.5 ${toneClass()}`}>
      <div class="text-[0.625rem] text-current/70">{props.label}</div>
      <div class="mt-0.5 text-[0.875rem] leading-none font-semibold">{props.value}</div>
    </div>
  );
}

function WarningsSection(props: {
  warnings: string[];
  journals: ApplyJournalSummary[];
  contextWarnings: string[];
}) {
  const hasWarnings = () =>
    props.warnings.length > 0 || props.journals.length > 0 || props.contextWarnings.length > 0;

  return (
    <Show when={hasWarnings()}>
      <section class="rounded-xs border border-warning-border bg-warning-bg">
        <div class={SECTION_HEADER}>
          <h3 class="text-[0.75rem] font-medium text-warning">Warnings</h3>
          <StatePill
            value={`${props.warnings.length + props.journals.length + props.contextWarnings.length}`}
          />
        </div>
        <div class="flex flex-col gap-2 p-3 text-[0.6875rem] text-warning">
          <For each={props.journals}>
            {(journal) => (
              <button
                type="button"
                class="min-w-0 text-left"
                onClick={() =>
                  journal.decisionDocumentPath && openDocument(journal.decisionDocumentPath)
                }
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate font-medium">{journal.state ?? "journal"}</span>
                  <span class="shrink-0 font-mono text-[0.625rem]">{journal.docId}</span>
                </div>
                <p class="mt-0.5 truncate font-mono text-[0.625rem] opacity-80">{journal.path}</p>
              </button>
            )}
          </For>
          <For each={[...props.warnings, ...props.contextWarnings]}>
            {(warning) => <p class="wrap-break-word">{warning}</p>}
          </For>
        </div>
      </section>
    </Show>
  );
}

function DocumentRow(props: { doc: DecisionDocumentSummary; onOpen: () => void }) {
  return (
    <div class="flex items-start gap-2 px-3 py-2">
      <button type="button" class="min-w-0 flex-1 text-left" onClick={props.onOpen}>
        <div class="flex items-center gap-2">
          <span class="min-w-0 truncate text-[0.75rem] font-medium text-text-primary">
            {props.doc.title}
          </span>
          <StatePill value={props.doc.status} />
        </div>
        <div class="mt-1 flex items-center gap-2 text-[0.625rem] text-text-muted">
          <StatePill value={props.doc.targetKind} />
          <span>{props.doc.decisionCount} decisions</span>
          <Show when={props.doc.missingRequiredCount > 0}>
            <span class="text-warning">{props.doc.missingRequiredCount} missing</span>
          </Show>
        </div>
        <p class="mt-0.5 truncate font-mono text-[0.625rem] text-text-muted">{props.doc.path}</p>
      </button>
      <button type="button" class={BUTTON} title="Open decision document" onClick={props.onOpen}>
        <EyeIcon />
      </button>
    </div>
  );
}

function MemoryRow(props: { memory: MemorySummary; onOpen: () => void }) {
  return (
    <div class="flex items-start gap-2 px-3 py-2">
      <button type="button" class="min-w-0 flex-1 text-left" onClick={props.onOpen}>
        <div class="flex items-center gap-2">
          <span class="min-w-0 truncate text-[0.75rem] font-medium text-text-primary">
            {props.memory.title}
          </span>
          <StatePill value={props.memory.status} />
        </div>
        <div class="mt-1 flex min-w-0 items-center gap-1 text-[0.625rem] text-text-muted">
          <Show when={props.memory.kind}>{(kind) => <span class="truncate">{kind()}</span>}</Show>
          <For each={props.memory.tags.slice(0, 2)}>
            {(tag) => <span class="truncate">#{tag}</span>}
          </For>
        </div>
        <p class="mt-0.5 truncate font-mono text-[0.625rem] text-text-muted">{props.memory.path}</p>
      </button>
      <button type="button" class={BUTTON} title="Open memory" onClick={props.onOpen}>
        <EyeIcon />
      </button>
    </div>
  );
}

function WikiRow(props: { page: WikiSummary; onOpen: () => void }) {
  return (
    <div class="flex items-start gap-2 px-3 py-2">
      <button type="button" class="min-w-0 flex-1 text-left" onClick={props.onOpen}>
        <div class="flex items-center gap-2">
          <span class="min-w-0 truncate text-[0.75rem] font-medium text-text-primary">
            {props.page.title}
          </span>
          <StatePill value={props.page.pageType} />
          <StatePill value={props.page.status} />
        </div>
        <div class="mt-1 flex min-w-0 items-center gap-1 text-[0.625rem] text-text-muted">
          <For each={props.page.tags.slice(0, 2)}>
            {(tag) => <span class="truncate">#{tag}</span>}
          </For>
        </div>
        <p class="mt-0.5 truncate font-mono text-[0.625rem] text-text-muted">{props.page.path}</p>
      </button>
      <button type="button" class={BUTTON} title="Open wiki page" onClick={props.onOpen}>
        <EyeIcon />
      </button>
    </div>
  );
}

function ContextRow(props: { item: ContextHit; onOpen: () => void }) {
  return (
    <div class="flex items-start gap-2 px-3 py-2">
      <button type="button" class="min-w-0 flex-1 text-left" onClick={props.onOpen}>
        <div class="flex items-center gap-2">
          <span class="min-w-0 truncate text-[0.75rem] font-medium text-text-primary">
            {props.item.hit.title}
          </span>
          <StatePill value={props.item.kind} />
          <StatePill value={`${props.item.hit.score}`} />
        </div>
        <p class="mt-1 line-clamp-2 text-[0.6875rem] text-text-secondary">
          {props.item.hit.snippet}
        </p>
        <p class="mt-0.5 truncate font-mono text-[0.625rem] text-text-muted">
          {props.item.hit.path}
        </p>
      </button>
      <button type="button" class={BUTTON} title="Open context result" onClick={props.onOpen}>
        <EyeIcon />
      </button>
    </div>
  );
}

function EmptyLine(props: { text: string }) {
  return <p class="px-3 py-2 text-[0.6875rem] text-text-muted">{props.text}</p>;
}

function BooleanChip(props: { value?: boolean }) {
  return (
    <StatePill
      value={statusChipLabel(props.value)}
      tone={props.value === false ? "warn" : "auto"}
    />
  );
}

function StatePill(props: { value?: string; tone?: "auto" | "warn" }) {
  const className = () =>
    props.tone === "warn" ? warningChipClass() : stateChipClass(props.value ?? "unknown");

  return (
    <span class={`shrink-0 rounded-xs border px-1.5 py-0.5 text-[0.625rem] ${className()}`}>
      {stateLabel(props.value)}
    </span>
  );
}

async function loadDecisionDocuments(warnings: string[]): Promise<DecisionDocumentSummary[]> {
  const entries = await safeListDirectory("Knowledge/decisions");
  const summaries = await Promise.all(
    markdownFiles(entries).map(async (entry) => {
      const markdown = await safeReadFile(entry.path, warnings);
      return markdown ? parseDecisionDocumentSummary(entry.path, markdown) : null;
    }),
  );
  return sortDecisionDocuments(summaries.filter(isPresent));
}

async function loadRecentMemory(warnings: string[]): Promise<MemorySummary[]> {
  const entries = await safeListDirectory("Knowledge/memory");
  const summaries = await Promise.all(
    markdownFiles(entries).map(async (entry) => {
      const markdown = await safeReadFile(entry.path, warnings);
      return markdown ? parseMemorySummary(entry.path, markdown) : null;
    }),
  );
  return sortRecentMemory(summaries.filter(isPresent)).slice(0, 8);
}

async function loadRecentWiki(warnings: string[]): Promise<WikiSummary[]> {
  const entries = await listDirectoryRecursive("Knowledge/wiki");
  const summaries = await Promise.all(
    markdownFiles(entries).map(async (entry) => {
      const markdown = await safeReadFile(entry.path, warnings);
      return markdown ? parseWikiSummary(entry.path, markdown) : null;
    }),
  );
  return sortRecentWiki(summaries.filter(isPresent)).slice(0, 8);
}

async function loadApplyJournals(warnings: string[]): Promise<ApplyJournalSummary[]> {
  const entries = await safeListDirectory(".kuku/knowledge/apply-journal");
  const summaries = await Promise.all(
    entries
      .filter((entry) => !entry.is_directory && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const content = await safeReadFile(entry.path, warnings);
        return content ? parseApplyJournalSummary(entry.path, content) : null;
      }),
  );
  return sortApplyJournals(summaries.filter(isPresent));
}

async function safeListDirectory(path: string): Promise<FileEntry[]> {
  try {
    return await listDirectory(path);
  } catch {
    return [];
  }
}

async function listDirectoryRecursive(path: string): Promise<FileEntry[]> {
  const entries = await safeListDirectory(path);
  const descendants = await Promise.all(
    entries
      .filter((entry) => entry.is_directory)
      .map((entry) => listDirectoryRecursive(entry.path)),
  );
  return [...entries, ...descendants.flat()];
}

async function safeReadFile(path: string, warnings: string[]): Promise<string | null> {
  try {
    return await readFile(path);
  } catch (error) {
    warnings.push(
      `Read failed for ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function markdownFiles(entries: FileEntry[]): FileEntry[] {
  return entries.filter((entry) => !entry.is_directory && entry.name.endsWith(".md"));
}

function openDocument(path: string, title = fileName(path)): void {
  openTab(title, path, "editor");
}

function fileName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function formatCommandError(
  result: Exclude<KnowledgeCommandResult<unknown>, { ok: true }>,
): string {
  return `${result.error.code}: ${result.error.message}`;
}

function statusChipLabel(value: boolean | undefined): string {
  if (value === undefined) return "n/a";
  if (value) return "yes";
  return "no";
}

function stateLabel(value: string | undefined): string {
  return (value ?? "unknown").replace(/_/g, " ");
}

function stateChipClass(value: string): string {
  if (["yes", "active", "applied", "committed", "initialized"].includes(value)) {
    return "border-success-border bg-success-bg text-success";
  }
  if (
    ["pending", "partially_applied", "needs_revision", "cleanup_required", "staged"].includes(value)
  ) {
    return warningChipClass();
  }
  if (["no", "apply_failed", "failed", "error"].includes(value)) {
    return "border-error-border bg-error-bg text-error";
  }
  return "border-border bg-bg-secondary text-text-muted";
}

function warningChipClass(): string {
  return "border-warning-border bg-warning-bg text-warning";
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export default KnowledgePanel;
