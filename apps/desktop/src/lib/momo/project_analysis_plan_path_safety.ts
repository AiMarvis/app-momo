function sourcePathError(path: string): "second_brain" | "unsafe" | null {
  const normalizedPath = unwrapPathToken(path);
  if (hasGitWriteIntent(normalizedPath)) return "unsafe";
  if (hasSecondBrainReference(normalizedPath)) return "second_brain";
  if (
    normalizedPath.startsWith("/") ||
    normalizedPath.startsWith("~") ||
    normalizedPath.includes("\\") ||
    normalizedPath.includes("\0") ||
    normalizedPath.includes("->") ||
    /^[A-Za-z]:[\\/]/.test(normalizedPath) ||
    normalizedPath.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    return "unsafe";
  }
  const root = normalizedPath.split("/")[0] ?? "";
  return SECOND_BRAIN_ROOTS.has(root) ? "second_brain" : null;
}

function hasGitWriteIntent(value: string): boolean {
  return (
    GIT_WRITE_COMMAND_PATTERN.test(value) ||
    hasGitWriteSubcommand(value) ||
    /\b(?:create|delete|remove|rename|move)\s+(?:a\s+|the\s+)?(?:git\s+)?(?:branch|tag)\b/i.test(
      value,
    )
  );
}

function hasSecondBrainReference(value: string): boolean {
  for (const root of SECOND_BRAIN_ROOTS) {
    if (new RegExp(`(?:^|[^\\p{L}\\p{N}_-])${escapeRegExp(root)}(?:$|[/\\\\])`, "u").test(value)) return true;
  }
  return false;
}

function hasGitWriteSubcommand(value: string): boolean {
  const tokens = value.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (stripQuotes(tokens[index] ?? "").toLowerCase() === "git" && gitSubcommandIsWrite(tokens, index + 1)) {
      return true;
    }
  }
  return false;
}

function gitSubcommandIsWrite(tokens: readonly string[], startIndex: number): boolean {
  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = stripQuotes(tokens[index] ?? "")
      .replace(/[.,;:!?]+$/g, "")
      .toLowerCase();
    if (token.length === 0) continue;
    if (gitGlobalOptionConsumesNext(token) && !token.includes("=") && index + 1 < tokens.length) {
      index += 1;
      continue;
    }
    if (gitGlobalOptionConsumesNone(token) || gitGlobalOptionConsumesNext(token) || /^-c.+/.test(token)) continue;
    return GIT_WRITE_COMMANDS.has(token);
  }
  return false;
}

function gitGlobalOptionConsumesNext(token: string): boolean {
  return ["-c", "-C", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env", "--super-prefix"].includes(
    token,
  );
}

function gitGlobalOptionConsumesNone(token: string): boolean {
  return (
    ["--bare", "--glob-pathspecs", "--icase-pathspecs", "--literal-pathspecs", "--no-optional-locks", "--no-pager", "--noglob-pathspecs", "--paginate", "-p"].includes(
      token,
    ) ||
    token.startsWith("-C") ||
    token.startsWith("--config-env=") ||
    token.startsWith("--exec-path=") ||
    token.startsWith("--git-dir=") ||
    token.startsWith("--namespace=") ||
    token.startsWith("--super-prefix=") ||
    token.startsWith("--work-tree=")
  );
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function unwrapPathToken(value: string): string {
  return value
    .trim()
    .replace(/^[`'"[\]({<]+/g, "")
    .replace(/[`'"\]})>.,;:!?]+$/g, "")
    .replace(/^(?:source|path|file):/i, "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SECOND_BRAIN_ROOTS = new Set([
  ".AgentRuns",
  "Calendar",
  "Inbox",
  "Issues",
  "Knowledge",
  "Organize Inbox",
  "Planning",
  "Projects",
  "Tasks",
]);

const GIT_WRITE_COMMANDS = new Set([
  "add",
  "am",
  "apply",
  "bisect",
  "branch",
  "checkout",
  "cherry-pick",
  "clean",
  "clone",
  "commit",
  "config",
  "fetch",
  "gc",
  "init",
  "merge",
  "mv",
  "notes",
  "pull",
  "push",
  "rebase",
  "reflog",
  "remote",
  "replace",
  "reset",
  "restore",
  "revert",
  "rm",
  "stash",
  "submodule",
  "switch",
  "symbolic-ref",
  "tag",
  "update-index",
  "update-ref",
  "worktree",
]);

const GIT_WRITE_COMMAND_PATTERN = new RegExp(`\\bgit\\s+(?:${[...GIT_WRITE_COMMANDS].join("|")})\\b`, "i");

export { hasGitWriteIntent, hasSecondBrainReference, sourcePathError };
