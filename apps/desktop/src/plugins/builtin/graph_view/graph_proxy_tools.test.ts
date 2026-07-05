import { describe, expect, it } from "vitest";

import type { GraphState } from "./graph_types";
import {
  buildFindOrphanNotesPayload,
  buildSuggestLinksPayload,
  buildSuggestLinksQuery,
  buildVaultStatsPayload,
} from "./graph_proxy_tools";

function createGraphState(): GraphState {
  return {
    nodes: [
      {
        id: "alpha.md",
        name: "Alpha",
        filePath: "alpha.md",
        folder: "Root",
        clusterIndex: 0,
        linkCount: 1,
        isOrphan: false,
      },
      {
        id: "beta.md",
        name: "Beta",
        filePath: "beta.md",
        folder: "Root",
        clusterIndex: 0,
        linkCount: 1,
        isOrphan: false,
      },
      {
        id: "orphan-a.md",
        name: "Orphan A",
        filePath: "orphan-a.md",
        folder: "Root",
        clusterIndex: 0,
        linkCount: 0,
        isOrphan: true,
      },
      {
        id: "orphan-b.md",
        name: "Orphan B",
        filePath: "orphan-b.md",
        folder: "Root",
        clusterIndex: 0,
        linkCount: 0,
        isOrphan: true,
      },
    ],
    links: [{ source: "alpha.md", target: "beta.md" }],
    adjacencyMap: {
      "alpha.md": ["beta.md"],
      "beta.md": ["alpha.md"],
    },
    clusters: ["Root"],
    isIndexing: false,
    lastIndexedAt: null,
    error: null,
  };
}

describe("graph proxy tools", () => {
  it("returns only degree-zero notes in path order", () => {
    const payload = buildFindOrphanNotesPayload(createGraphState(), 1);
    expect(payload.notes).toEqual([{ path: "orphan-a.md", name: "Orphan A", degree: 0 }]);
  });

  it("combines graph counts with indexer status", () => {
    const payload = buildVaultStatsPayload(createGraphState(), {
      state: "idle",
      totalDocs: 4,
      indexedDocs: 4,
      lastIndexedAt: 123,
      resolvedLinks: 1,
      unresolvedLinks: 0,
      ambiguousLinks: 0,
      error: null,
    });

    expect(payload).toEqual({
      totalNotes: 4,
      totalLinks: 1,
      orphanNotes: 2,
      indexerStatus: {
        state: "idle",
        totalDocs: 4,
        indexedDocs: 4,
        lastIndexedAt: 123,
        resolvedLinks: 1,
        unresolvedLinks: 0,
        ambiguousLinks: 0,
        error: null,
      },
    });
  });

  it("filters self, linked, and duplicate search hits and sorts by score", () => {
    const state = createGraphState();
    const payload = buildSuggestLinksPayload(
      state,
      "alpha.md",
      {
        query: "Alpha",
        total: 5,
        items: [
          {
            docId: "alpha.md",
            title: "Alpha",
            sectionPath: [],
            sectionOrdinal: 0,
            snippet: "",
            kind: "title",
            score: 10,
          },
          {
            docId: "beta.md",
            title: "Beta",
            sectionPath: [],
            sectionOrdinal: 0,
            snippet: "",
            kind: "title",
            score: 9,
          },
          {
            docId: "delta.md",
            title: null,
            sectionPath: [],
            sectionOrdinal: 0,
            snippet: "",
            kind: "title",
            score: 7,
          },
          {
            docId: "gamma.md",
            title: "Gamma",
            sectionPath: [],
            sectionOrdinal: 0,
            snippet: "",
            kind: "title",
            score: 8,
          },
          {
            docId: "gamma.md",
            title: "Gamma duplicate",
            sectionPath: [],
            sectionOrdinal: 1,
            snippet: "",
            kind: "body",
            score: 6,
          },
        ],
      },
      10,
    );

    expect(payload).toEqual({
      path: "alpha.md",
      candidates: [
        { path: "gamma.md", title: "Gamma", score: 8, reason: "content similarity" },
        { path: "delta.md", title: "delta", score: 7, reason: "content similarity" },
      ],
    });
  });

  it("derives the search query from the graph node name or basename", () => {
    const state = createGraphState();
    expect(buildSuggestLinksQuery(state, "alpha.md")).toBe("Alpha");
    expect(buildSuggestLinksQuery(state, "nested/unknown-note.md")).toBe("unknown-note");
  });
});
