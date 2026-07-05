import type { FileEntry } from "~/lib/vault_types";

const NATURAL_SORT_OPTIONS = {
  ignorePunctuation: true,
  numeric: true,
  sensitivity: "base",
  usage: "sort",
} as const;

function createNaturalCollator(locales?: Intl.LocalesArgument): Intl.Collator {
  return new Intl.Collator(locales, NATURAL_SORT_OPTIONS);
}

function sortVaultEntriesNaturally(
  entries: FileEntry[],
  locales?: Intl.LocalesArgument,
): FileEntry[] {
  const collator = createNaturalCollator(locales);

  const sortNodes = (nodes: FileEntry[]): FileEntry[] =>
    [...nodes]
      .sort((left, right) => {
        if (left.is_directory !== right.is_directory) {
          return left.is_directory ? -1 : 1;
        }

        const nameOrder = collator.compare(left.name, right.name);
        if (nameOrder !== 0) {
          return nameOrder;
        }

        return left.path.localeCompare(right.path);
      })
      .map((entry) => ({
        ...entry,
        children: entry.children ? sortNodes(entry.children) : entry.children,
      }));

  return sortNodes(entries);
}

export { sortVaultEntriesNaturally };
