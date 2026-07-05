import { createSignal } from "solid-js";

type SearchMode = "simple" | "regex";

const [getSearchMode, setSearchMode] = createSignal<SearchMode>("simple");
const [getRegexCaseSensitive, setRegexCaseSensitive] = createSignal(false);

function resetSearchModeState(): void {
  setSearchMode("simple");
  setRegexCaseSensitive(false);
}

export {
  getRegexCaseSensitive,
  getSearchMode,
  resetSearchModeState,
  setRegexCaseSensitive,
  setSearchMode,
};
export type { SearchMode };
