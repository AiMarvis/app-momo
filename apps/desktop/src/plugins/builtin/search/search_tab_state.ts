import { createSignal, onCleanup } from "solid-js";

import { t } from "~/i18n";
import { getSearchService } from "./runtime";
import {
  getRegexCaseSensitive,
  getSearchMode,
  setRegexCaseSensitive,
  setSearchMode,
} from "./search_mode_state";
import type { SearchService } from "../core_indexer/service";
import type { SimpleSearchResult } from "../core_indexer/types";
import { onEvent } from "~/plugins/events";

interface SearchTabController {
  mode: () => "simple" | "regex";
  caseSensitive: () => boolean;
  query: () => string;
  results: () => SimpleSearchResult | null;
  isLoading: () => boolean;
  error: () => string | null;
  setMode(nextMode: "simple" | "regex"): void;
  setCaseSensitive(nextValue: boolean): void;
  scheduleSearch(nextQuery: string): void;
  requestRebuild(): Promise<void>;
}

function createSearchTabController(
  serviceAccessor: () => SearchService | null = getSearchService,
): SearchTabController {
  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<SimpleSearchResult | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  let sequenceId = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  const resetSearchState = () => {
    clearTimer();
    sequenceId += 1;
    setQuery("");
    setResults(null);
    setError(null);
    setIsLoading(false);
  };

  const executeSearch = async (nextQuery: string) => {
    const trimmed = nextQuery.trim();
    const service = serviceAccessor();
    const currentId = ++sequenceId;

    if (!trimmed) {
      setResults(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (!service) {
      setError(t("search.error.unavailable"));
      setResults(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res =
        getSearchMode() === "regex"
          ? await service.queryAdvanced({
              query: trimmed,
              caseSensitive: getRegexCaseSensitive(),
            })
          : await service.querySimple(trimmed);
      if (currentId !== sequenceId) return;
      setResults(res);
      setIsLoading(false);
    } catch (caughtError) {
      if (currentId !== sequenceId) return;
      setResults(null);
      setError(caughtError instanceof Error ? caughtError.message : t("search.error.failed"));
      setIsLoading(false);
    }
  };

  const scheduleSearch = (nextQuery: string) => {
    setQuery(nextQuery);
    clearTimer();

    if (!nextQuery.trim()) {
      sequenceId += 1;
      setResults(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    debounceTimer = setTimeout(() => {
      void executeSearch(nextQuery);
    }, 250);
  };

  const requestRebuild = async () => {
    const service = serviceAccessor();
    if (!service) return;
    await service.requestRebuild();
  };

  const rerunCurrentQuery = () => {
    scheduleSearch(query());
  };

  const setMode = (nextMode: "simple" | "regex") => {
    if (getSearchMode() === nextMode) return;
    setSearchMode(nextMode);
    rerunCurrentQuery();
  };

  const setCaseSensitive = (nextValue: boolean) => {
    if (getRegexCaseSensitive() === nextValue) return;
    setRegexCaseSensitive(nextValue);
    if (getSearchMode() === "regex") {
      rerunCurrentQuery();
    }
  };

  const disposeVaultOpened = onEvent("vault:opened", () => {
    resetSearchState();
  });
  const disposeVaultClosed = onEvent("vault:closed", () => {
    resetSearchState();
  });

  onCleanup(() => {
    clearTimer();
    disposeVaultOpened();
    disposeVaultClosed();
  });

  return {
    mode: getSearchMode,
    caseSensitive: getRegexCaseSensitive,
    query,
    results,
    isLoading,
    error,
    setMode,
    setCaseSensitive,
    scheduleSearch,
    requestRebuild,
  };
}

export { createSearchTabController };
export type { SearchTabController };
