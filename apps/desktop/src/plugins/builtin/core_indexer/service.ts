import { invoke } from "@tauri-apps/api/core";

import type {
  AdvancedQueryRequest,
  GraphSnapshot,
  IndexerConfig,
  IndexerDebugStatus,
  IndexerStatus,
  ResolveWikilinkResult,
  SimpleSearchResult,
} from "./types";

interface SearchService {
  querySimple(query: string, options?: { maxResults?: number }): Promise<SimpleSearchResult>;
  queryAdvanced(request: AdvancedQueryRequest): Promise<SimpleSearchResult>;
  getStatus(): Promise<IndexerStatus>;
  getDebugStatus(): Promise<IndexerDebugStatus>;
  requestRebuild(): Promise<void>;
  getGraphSnapshot(): Promise<GraphSnapshot>;
  resolveWikilink(sourcePath: string, rawTarget: string): Promise<ResolveWikilinkResult>;
  getConfig(): Promise<IndexerConfig>;
  setConfig(config: IndexerConfig): Promise<void>;
}

function createSearchService(): SearchService {
  return {
    async querySimple(query, options) {
      return invoke<SimpleSearchResult>("search_query_simple", {
        query,
        maxResults: options?.maxResults ?? 20,
      });
    },
    async queryAdvanced(request) {
      return invoke<SimpleSearchResult>("search_query_advanced", {
        request: {
          query: request.query,
          caseSensitive: request.caseSensitive,
          maxResults: request.maxResults ?? 20,
        },
      });
    },
    async getStatus() {
      return invoke<IndexerStatus>("search_get_status");
    },
    async getDebugStatus() {
      return invoke<IndexerDebugStatus>("search_get_debug_status");
    },
    async requestRebuild() {
      await invoke<void>("search_request_rebuild");
    },
    async getGraphSnapshot() {
      return invoke<GraphSnapshot>("search_get_graph_snapshot");
    },
    async resolveWikilink(sourcePath, rawTarget) {
      return invoke<ResolveWikilinkResult>("search_resolve_wikilink", {
        sourcePath,
        rawTarget,
      });
    },
    async getConfig() {
      return invoke<IndexerConfig>("search_get_config");
    },
    async setConfig(config) {
      await invoke<void>("search_set_config", { config });
    },
  };
}

export { createSearchService };
export type { SearchService };
