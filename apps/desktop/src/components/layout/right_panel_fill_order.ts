import { createSignal } from "solid-js";

import type { SlotFill } from "~/plugins/types";

const RIGHT_PANEL_FILL_ORDER_KEY = "right-panel-fill-order";
const RIGHT_PANEL_FILL_DRAG_MIME = "application/x-right-panel-fill-id";
let activePointerDragFillId: string | null = null;
let clearPointerDragListeners: (() => void) | null = null;

const [rightPanelFillOrderIds, setRightPanelFillOrderIds] = createSignal<string[]>(
  loadRightPanelFillOrderIds(),
);

function orderedRightPanelFills(fills: readonly SlotFill[]): SlotFill[] {
  const orderIds = rightPanelFillOrderIds();
  const byId = new Map(fills.map((fill) => [fill.id, fill]));
  const seen = new Set<string>();
  const ordered: SlotFill[] = [];

  for (const fillId of orderIds) {
    const fill = byId.get(fillId);
    if (!fill || seen.has(fillId)) continue;
    ordered.push(fill);
    seen.add(fillId);
  }

  for (const fill of fills) {
    if (seen.has(fill.id)) continue;
    ordered.push(fill);
    seen.add(fill.id);
  }

  return ordered;
}

function placeRightPanelFill(
  fillId: string,
  beforeFillId: string | null,
  currentFillIds: readonly string[],
): void {
  if (beforeFillId === fillId) return;
  if (!currentFillIds.includes(fillId)) return;

  const withoutFill = currentFillIds.filter((candidate) => candidate !== fillId);
  const beforeIndex = beforeFillId ? withoutFill.indexOf(beforeFillId) : -1;
  const next =
    beforeIndex === -1
      ? [...withoutFill, fillId]
      : [...withoutFill.slice(0, beforeIndex), fillId, ...withoutFill.slice(beforeIndex)];

  saveRightPanelFillOrderIds(next);
  setRightPanelFillOrderIds(next);
}

function readRightPanelFillDragData(event: DragEvent): string | null {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) return null;

  return parseRightPanelFillId(
    dataTransfer.getData(RIGHT_PANEL_FILL_DRAG_MIME) || dataTransfer.getData("text/plain"),
  );
}

function writeRightPanelFillDragData(event: DragEvent, fillId: string): void {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) return;

  dataTransfer.effectAllowed = "move";
  dataTransfer.setData(RIGHT_PANEL_FILL_DRAG_MIME, fillId);
  dataTransfer.setData("text/plain", fillId);
}

function startRightPanelFillPointerDrag(fillId: string): void {
  activePointerDragFillId = fillId;
  clearPointerDragListeners?.();

  const targetWindow = getWindow();
  if (!targetWindow) return;

  const clearOnRelease = () => clearRightPanelFillPointerDrag();
  targetWindow.addEventListener("pointerup", clearOnRelease, { once: true });
  targetWindow.addEventListener("pointercancel", clearOnRelease, { once: true });
  clearPointerDragListeners = () => {
    targetWindow.removeEventListener("pointerup", clearOnRelease);
    targetWindow.removeEventListener("pointercancel", clearOnRelease);
    clearPointerDragListeners = null;
  };
}

function readRightPanelFillPointerDrag(): string | null {
  return activePointerDragFillId;
}

function clearRightPanelFillPointerDrag(): void {
  activePointerDragFillId = null;
  clearPointerDragListeners?.();
}

function parseRightPanelFillId(value: string | undefined): string | null {
  if (!value) return null;
  return value.trim() ? value : null;
}

function loadRightPanelFillOrderIds(): string[] {
  const raw = getStorage()?.getItem(RIGHT_PANEL_FILL_ORDER_KEY);
  if (!raw) return [];

  try {
    return normalizeFillIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

function saveRightPanelFillOrderIds(fillIds: readonly string[]): void {
  getStorage()?.setItem(RIGHT_PANEL_FILL_ORDER_KEY, JSON.stringify(fillIds));
}

function normalizeFillIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const fillIds: string[] = [];
  for (const candidate of value) {
    const fillId = typeof candidate === "string" ? parseRightPanelFillId(candidate) : null;
    if (fillId && !fillIds.includes(fillId)) fillIds.push(fillId);
  }

  return fillIds;
}

function getStorage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function getWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}

export {
  clearRightPanelFillPointerDrag,
  orderedRightPanelFills,
  parseRightPanelFillId,
  placeRightPanelFill,
  readRightPanelFillDragData,
  readRightPanelFillPointerDrag,
  rightPanelFillOrderIds,
  startRightPanelFillPointerDrag,
  writeRightPanelFillDragData,
};
