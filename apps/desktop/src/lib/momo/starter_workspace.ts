const STARTER_WORKSPACE_FOLDERS = [
  "Inbox",
  "Daily",
  "Tasks",
  "Projects",
  "Issues",
  "Calendar",
  "Knowledge",
  ".AgentRuns",
] as const;

type StarterWorkspaceFolder = (typeof STARTER_WORKSPACE_FOLDERS)[number];
type CreateFolder = (path: StarterWorkspaceFolder) => PromiseLike<unknown> | void;

function isSafeRootFolderName(name: string): boolean {
  return (
    name.length > 0 &&
    !name.includes("\0") &&
    !name.includes("/") &&
    !name.includes("\\") &&
    name !== ".." &&
    (!name.startsWith(".") || name === ".AgentRuns")
  );
}

function missingStarterWorkspaceFolders(
  existingRootNames: readonly string[],
): StarterWorkspaceFolder[] {
  const existing = new Set<string>();
  for (const name of existingRootNames) {
    if (isSafeRootFolderName(name)) existing.add(name.toLowerCase());
  }
  return STARTER_WORKSPACE_FOLDERS.filter((folder) => !existing.has(folder.toLowerCase()));
}

async function createMissingStarterWorkspaceFolders(
  existingRootNames: readonly string[],
  createFolder: CreateFolder,
): Promise<StarterWorkspaceFolder[]> {
  const missing = missingStarterWorkspaceFolders(existingRootNames);
  for (const folder of missing) {
    await createFolder(folder);
  }
  return missing;
}

export {
  STARTER_WORKSPACE_FOLDERS,
  createMissingStarterWorkspaceFolders,
  missingStarterWorkspaceFolders,
};
export type { CreateFolder, StarterWorkspaceFolder };
