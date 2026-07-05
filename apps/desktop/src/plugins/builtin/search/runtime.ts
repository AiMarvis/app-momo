import { createSignal } from "solid-js";

import type { SearchService } from "../core_indexer/service";

const [getSearchService, setSearchService] = createSignal<SearchService | null>(null);

export { getSearchService, setSearchService };
