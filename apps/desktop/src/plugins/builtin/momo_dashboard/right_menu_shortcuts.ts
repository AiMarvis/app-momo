import { createSignal } from "solid-js";

import {
  MOMO_OPERATION_ENTRIES,
  getMomoOperationSurfaceEntry,
  type MomoOperationSurfaceEntry,
  type MomoOperationSurfaceId,
} from "./navigation";

const RIGHT_MENU_SHORTCUTS_KEY = "momo-right-menu-shortcuts";
const MOMO_SURFACE_DRAG_MIME = "application/x-momo-surface-id";
const DEFAULT_RIGHT_MENU_SURFACE_IDS: readonly MomoOperationSurfaceId[] = [];
const SURFACE_IDS = MOMO_OPERATION_ENTRIES.map((entry) => entry.id);
let activePointerDragSurfaceId: MomoOperationSurfaceId | null = null;
let clearPointerDragListeners: (() => void) | null = null;

const [rightMenuSurfaceIds, setRightMenuSurfaceIds] = createSignal<MomoOperationSurfaceId[]>(
  loadRightMenuSurfaceIds(),
);

function rightMenuSurfaces(): MomoOperationSurfaceEntry[] {
  return rightMenuSurfaceIds().map(getMomoOperationSurfaceEntry);
}

function placeRightMenuSurface(
  surfaceId: MomoOperationSurfaceId,
  beforeSurfaceId: MomoOperationSurfaceId | null,
): void {
  setRightMenuSurfaceIds((current) => {
    const withoutSurface = current.filter((candidate) => candidate !== surfaceId);
    const beforeIndex = beforeSurfaceId ? withoutSurface.indexOf(beforeSurfaceId) : -1;
    const next =
      beforeIndex === -1
        ? [...withoutSurface, surfaceId]
        : [
            ...withoutSurface.slice(0, beforeIndex),
            surfaceId,
            ...withoutSurface.slice(beforeIndex),
          ];
    saveRightMenuSurfaceIds(next);
    return next;
  });
}

function readMomoSurfaceDragData(event: DragEvent): MomoOperationSurfaceId | null {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) return null;

  const candidate =
    dataTransfer.getData(MOMO_SURFACE_DRAG_MIME) || dataTransfer.getData("text/plain");
  return isMomoSurfaceId(candidate) ? candidate : null;
}

function writeMomoSurfaceDragData(event: DragEvent, surfaceId: MomoOperationSurfaceId): void {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) return;

  dataTransfer.effectAllowed = "move";
  dataTransfer.setData(MOMO_SURFACE_DRAG_MIME, surfaceId);
  dataTransfer.setData("text/plain", surfaceId);
}

function startMomoSurfacePointerDrag(surfaceId: MomoOperationSurfaceId): void {
  activePointerDragSurfaceId = surfaceId;
  clearPointerDragListeners?.();

  const targetWindow = getWindow();
  if (!targetWindow) return;

  const clearOnRelease = () => clearMomoSurfacePointerDrag();
  targetWindow.addEventListener("pointerup", clearOnRelease, { once: true });
  targetWindow.addEventListener("pointercancel", clearOnRelease, { once: true });
  clearPointerDragListeners = () => {
    targetWindow.removeEventListener("pointerup", clearOnRelease);
    targetWindow.removeEventListener("pointercancel", clearOnRelease);
    clearPointerDragListeners = null;
  };
}

function readMomoSurfacePointerDrag(): MomoOperationSurfaceId | null {
  return activePointerDragSurfaceId;
}

function parseMomoOperationSurfaceId(value: string | undefined): MomoOperationSurfaceId | null {
  if (!value) return null;
  return isMomoSurfaceId(value) ? value : null;
}

function clearMomoSurfacePointerDrag(): void {
  activePointerDragSurfaceId = null;
  clearPointerDragListeners?.();
}

function loadRightMenuSurfaceIds(): MomoOperationSurfaceId[] {
  const raw = getStorage()?.getItem(RIGHT_MENU_SHORTCUTS_KEY);
  if (!raw) return [...DEFAULT_RIGHT_MENU_SURFACE_IDS];

  try {
    return normalizeSurfaceIds(JSON.parse(raw));
  } catch {
    return [...DEFAULT_RIGHT_MENU_SURFACE_IDS];
  }
}

function saveRightMenuSurfaceIds(surfaceIds: readonly MomoOperationSurfaceId[]): void {
  getStorage()?.setItem(RIGHT_MENU_SHORTCUTS_KEY, JSON.stringify(surfaceIds));
}

function normalizeSurfaceIds(value: unknown): MomoOperationSurfaceId[] {
  if (!Array.isArray(value)) return [...DEFAULT_RIGHT_MENU_SURFACE_IDS];

  const surfaceIds: MomoOperationSurfaceId[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string" || !isMomoSurfaceId(candidate)) continue;
    if (!surfaceIds.includes(candidate)) surfaceIds.push(candidate);
  }

  return surfaceIds;
}

function isMomoSurfaceId(value: string): value is MomoOperationSurfaceId {
  return SURFACE_IDS.some((surfaceId) => surfaceId === value);
}

function getStorage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function getWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}

export {
  clearMomoSurfacePointerDrag,
  parseMomoOperationSurfaceId,
  placeRightMenuSurface,
  readMomoSurfaceDragData,
  readMomoSurfacePointerDrag,
  rightMenuSurfaceIds,
  rightMenuSurfaces,
  startMomoSurfacePointerDrag,
  writeMomoSurfaceDragData,
};
