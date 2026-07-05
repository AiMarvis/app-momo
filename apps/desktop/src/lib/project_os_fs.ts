import { invoke } from "@tauri-apps/api/core";

export type ProjectOsManifest = {
  readonly rootName: string;
  readonly files: readonly ProjectOsFileSnippet[];
  readonly skipped: readonly ProjectOsSkippedPath[];
  readonly limits: ProjectOsScanLimits;
};

export type ProjectOsFileSnippet = {
  readonly path: string;
  readonly size: number;
  readonly snippet: string;
};

export type ProjectOsSkippedPath = {
  readonly path: string;
  readonly reason: string;
};

export type ProjectOsScanLimits = {
  readonly maxFiles: number;
  readonly maxBytes: number;
  readonly bytesRead: number;
  readonly truncated: boolean;
};

export async function chooseProjectOsFolder(): Promise<string | null> {
  return invoke<string | null>("project_os_choose_folder");
}

export async function scanProjectOsFolder(path: string): Promise<ProjectOsManifest> {
  validateProjectRoot(path);
  const manifest = await invoke<ProjectOsManifest>("project_os_scan_folder", { path });
  validateProjectManifest(manifest);
  return manifest;
}

function validateProjectRoot(path: string): void {
  if (path.trim() === "") {
    throw new Error("Invalid project root: empty path");
  }
  if (path.includes("\0")) {
    throw new Error("Invalid project root: null byte");
  }
  if (!isAbsolutePath(path)) {
    throw new Error(`Invalid project root: must be absolute: ${path}`);
  }
  if (path.split(/[/\\]/).some((segment) => segment === "..")) {
    throw new Error(`Invalid project root: traversal segment: ${path}`);
  }
}

function validateProjectManifest(manifest: ProjectOsManifest): void {
  for (const file of manifest.files) {
    validateManifestPath(file.path);
  }
  for (const skipped of manifest.skipped) {
    validateManifestPath(skipped.path);
  }
}

function validateManifestPath(path: string): void {
  if (path === "" || path.includes("\0") || isAbsolutePath(path)) {
    throw new Error(`Invalid project manifest path: ${path}`);
  }
  if (path.split(/[/\\]/).some((segment) => segment === "..")) {
    throw new Error(`Invalid project manifest path: ${path}`);
  }
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || path.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(path);
}
