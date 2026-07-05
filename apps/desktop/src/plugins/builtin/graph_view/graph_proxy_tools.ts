import type { IndexerStatus, SimpleSearchResult } from "../core_indexer/types";
import type { GraphState } from "./graph_types";

interface OrphanNote {
  path: string;
  name: string;
  degree: number;
}

interface OrphanNotesPayload {
  notes: OrphanNote[];
}

interface VaultStatsPayload {
  totalNotes: number;
  totalLinks: number;
  orphanNotes: number;
  indexerStatus?: IndexerStatus;
}

interface SuggestLinkCandidate {
  path: string;
  title: string;
  score: number;
  reason: string;
}

interface SuggestLinksPayload {
  path: string;
  candidates: SuggestLinkCandidate[];
}

function buildFindOrphanNotesPayload(state: GraphState, limit: unknown = 20): OrphanNotesPayload {
  const safeLimit = toNonNegativeInteger(limit, 20);
  const notes = [...state.nodes]
    .map((node) => ({
      path: node.filePath,
      name: node.name,
      degree: state.adjacencyMap[node.filePath]?.length ?? 0,
    }))
    .filter((note) => note.degree === 0)
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, safeLimit);

  return { notes };
}

function buildVaultStatsPayload(
  state: GraphState,
  indexerStatus?: IndexerStatus,
): VaultStatsPayload {
  const orphanNotes = state.nodes.filter(
    (node) => (state.adjacencyMap[node.filePath] ?? []).length === 0,
  ).length;

  return {
    totalNotes: state.nodes.length,
    totalLinks: state.links.length,
    orphanNotes,
    indexerStatus,
  };
}

function buildSuggestLinksQuery(state: GraphState, path: string): string {
  const node = state.nodes.find(
    (candidate) => candidate.filePath === path || candidate.id === path,
  );
  return node?.name ?? stripMarkdownExtension(baseName(path));
}

function buildSuggestLinksPayload(
  state: GraphState,
  path: string,
  result: SimpleSearchResult,
  maxResults = 10,
): SuggestLinksPayload {
  const safeLimit = toNonNegativeInteger(maxResults, 10);
  const linked = new Set(state.adjacencyMap[path]);
  const seen = new Set<string>();
  const candidates: SuggestLinkCandidate[] = [];

  for (const item of result.items) {
    const candidatePath = item.docId;
    if (
      !candidatePath ||
      candidatePath === path ||
      linked.has(candidatePath) ||
      seen.has(candidatePath)
    ) {
      continue;
    }

    seen.add(candidatePath);
    candidates.push({
      path: candidatePath,
      title: item.title ?? stripMarkdownExtension(baseName(candidatePath)),
      score: item.score,
      reason: "content similarity",
    });
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.path.localeCompare(right.path);
  });

  return {
    path,
    candidates: candidates.slice(0, safeLimit),
  };
}

function toNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

function baseName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.(md|markdown)$/i, "");
}

export {
  buildFindOrphanNotesPayload,
  buildSuggestLinksPayload,
  buildSuggestLinksQuery,
  buildVaultStatsPayload,
};
export type { OrphanNotesPayload, SuggestLinksPayload, VaultStatsPayload };
