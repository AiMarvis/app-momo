import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";

import type { SearchService } from "~/plugins/builtin/core_indexer/service";

import type { GraphState, GraphStoreLike } from "./graph_types";

interface GraphStoreConfig {
  service: SearchService;
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 300;

const [getGraphStore, setGraphStore] = createSignal<GraphStoreLike | null>(null);

function createGraphStore(config: GraphStoreConfig): GraphStoreLike {
  const debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const [state, setState] = createStore<GraphState>({
    nodes: [],
    links: [],
    adjacencyMap: {},
    clusters: [],
    isIndexing: false,
    lastIndexedAt: null,
    error: null,
  });

  let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshInFlight = false;
  let rerunRequested = false;
  let disposed = false;

  async function buildGraphData(): Promise<void> {
    if (disposed) return;
    if (refreshInFlight) {
      rerunRequested = true;
      return;
    }

    refreshInFlight = true;
    setState("error", null);

    try {
      const [snapshot, status] = await Promise.all([
        config.service.getGraphSnapshot(),
        config.service.getStatus(),
      ]);
      const clusters = [...new Set(snapshot.nodes.map((node) => node.folder))].sort();

      setState(
        produce((s) => {
          s.nodes = snapshot.nodes;
          s.links = snapshot.links;
          s.adjacencyMap = snapshot.adjacencyMap;
          s.clusters = clusters;
          s.isIndexing = status.state === "indexing";
          s.lastIndexedAt = status.lastIndexedAt;
          s.error = status.error ?? null;
        }),
      );

      if (status.state === "indexing" && !disposed) {
        scheduleRebuild(Math.max(debounceMs, 500));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState(
        produce((s) => {
          s.isIndexing = false;
          s.error = message;
        }),
      );
    } finally {
      refreshInFlight = false;
      if (rerunRequested && !disposed) {
        rerunRequested = false;
        void buildGraphData();
      }
    }
  }

  function scheduleRebuild(delay = debounceMs): void {
    if (disposed) return;
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      void buildGraphData();
    }, delay);
  }

  function clear(): void {
    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
      rebuildTimer = null;
    }
    setState({
      nodes: [],
      links: [],
      adjacencyMap: {},
      clusters: [],
      isIndexing: false,
      lastIndexedAt: null,
      error: null,
    });
  }

  function dispose(): void {
    disposed = true;
    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
      rebuildTimer = null;
    }
  }

  return { state, buildGraphData, scheduleRebuild, clear, dispose };
}

function getOutgoingLinks(store: GraphStoreLike, filePath: string): string[] {
  return store.state.links.filter((l) => l.source === filePath).map((l) => l.target);
}

function getBacklinks(store: GraphStoreLike, filePath: string): string[] {
  return store.state.links.filter((l) => l.target === filePath).map((l) => l.source);
}

function getConnectedNodes(store: GraphStoreLike, filePath: string): string[] {
  return store.state.adjacencyMap[filePath] ?? [];
}

export {
  createGraphStore,
  getBacklinks,
  getConnectedNodes,
  getGraphStore,
  getOutgoingLinks,
  setGraphStore,
};
