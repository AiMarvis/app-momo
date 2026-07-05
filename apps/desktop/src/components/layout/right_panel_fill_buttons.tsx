import { type JSX, For, createSignal, onCleanup, onMount } from "solid-js";

import {
  CalendarIcon,
  GraphIcon,
  KukuIcon,
  ListIcon,
  MessageSquareIcon,
  MomoAgentIcon,
  SecondBrainIcon,
  StickyNoteIcon,
  VoxelIcon,
} from "~/components/icons";
import type { SlotFill } from "~/plugins/types";
import { layoutState, setActiveRightPanelView } from "~/stores/layout";
import {
  clearRightPanelFillPointerDrag,
  parseRightPanelFillId,
  placeRightPanelFill,
  readRightPanelFillDragData,
  readRightPanelFillPointerDrag,
  startRightPanelFillPointerDrag,
  writeRightPanelFillDragData,
} from "./right_panel_fill_order";

const RIGHT_PANEL_FILL_DROP_TARGET_ATTR = "data-right-panel-fill-drop-target";

function iconForFill(icon: string | undefined, size: number): JSX.Element {
  if (icon === "calendar") return <CalendarIcon size={size} />;
  if (icon === "graph") return <GraphIcon size={size} />;
  if (icon === "list") return <ListIcon size={size} />;
  if (icon === "sticky-note") return <StickyNoteIcon size={size} />;
  if (icon === "voxel") return <VoxelIcon size={size} />;
  if (icon === "message-square") return <MessageSquareIcon size={size} />;
  if (icon === "momo-agent") return <MomoAgentIcon size={size} />;
  if (icon === "second-brain") return <SecondBrainIcon size={size} />;
  return <KukuIcon size={size} />;
}

function RightPanelFillButtons(props: { readonly fills: readonly SlotFill[] }) {
  const currentFillIds = () => props.fills.map((fill) => fill.id);
  const [dropTargetFillId, setDropTargetFillId] = createSignal<string | "end" | null>(null);

  onMount(() => {
    const dropFillFromPointerLocation = (event: PointerEvent) => {
      const fillId = readRightPanelFillPointerDrag();
      if (!fillId) return;

      const target = document.elementFromPoint(event.clientX, event.clientY);
      const dropTarget = target?.closest(`[${RIGHT_PANEL_FILL_DROP_TARGET_ATTR}]`);
      if (!(dropTarget instanceof HTMLElement)) {
        clearRightPanelFillPointerDrag();
        setDropTargetFillId(null);
        return;
      }

      const rawDropTarget = dropTarget.dataset.rightPanelFillDropTarget;
      const beforeFillId = rawDropTarget === "end" ? null : parseRightPanelFillId(rawDropTarget);
      if (rawDropTarget !== "end" && !beforeFillId) return;

      placeRightPanelFill(fillId, beforeFillId, currentFillIds());
      clearRightPanelFillPointerDrag();
      setDropTargetFillId(null);
    };

    window.addEventListener("pointerup", dropFillFromPointerLocation, true);
    onCleanup(() => window.removeEventListener("pointerup", dropFillFromPointerLocation, true));
  });

  function allowFillDrop(event: DragEvent, target: string | "end"): void {
    if (!readRightPanelFillDragData(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const dataTransfer = event.dataTransfer;
    if (dataTransfer) dataTransfer.dropEffect = "move";
    setDropTargetFillId(target);
  }

  function dropFill(event: DragEvent, beforeFillId: string | null): void {
    const fillId = readRightPanelFillDragData(event);
    if (!fillId) return;

    event.preventDefault();
    event.stopPropagation();
    placeRightPanelFill(fillId, beforeFillId, currentFillIds());
    setDropTargetFillId(null);
  }

  function allowPointerFillDrop(event: PointerEvent, target: string | "end"): void {
    if (!readRightPanelFillPointerDrag()) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTargetFillId(target);
  }

  function dropPointerFill(event: PointerEvent, beforeFillId: string | null): void {
    const fillId = readRightPanelFillPointerDrag();
    if (!fillId) return;

    event.preventDefault();
    event.stopPropagation();
    placeRightPanelFill(fillId, beforeFillId, currentFillIds());
    clearRightPanelFillPointerDrag();
    setDropTargetFillId(null);
  }

  function startFillPointerDrag(event: PointerEvent, fillId: string): void {
    if (event.button === 0) startRightPanelFillPointerDrag(fillId);
  }

  return (
    <div
      data-right-panel-fill-drop-target="end"
      class="flex min-w-0 items-center gap-0.5"
      onDragOver={(event) => allowFillDrop(event, "end")}
      onDrop={(event) => dropFill(event, null)}
      onDragLeave={() => setDropTargetFillId(null)}
      onPointerMove={(event) => allowPointerFillDrop(event, "end")}
      onPointerUp={(event) => dropPointerFill(event, null)}
    >
      <For each={props.fills}>
        {(fill) => {
          const isActive = () => layoutState.activeRightPanelViewId === fill.id;
          const isDropTarget = () => dropTargetFillId() === fill.id;

          return (
            <button
              data-right-panel-fill-drop-target={fill.id}
              type="button"
              title={fill.label}
              draggable={true}
              class={`flex size-7 cursor-grab items-center justify-center rounded-xs border-none bg-transparent transition-all duration-100 active:cursor-grabbing ${
                isActive()
                  ? "text-icon ring-1 ring-border-focused"
                  : "text-icon-muted hover:bg-ghost-hover hover:text-icon"
              } ${isDropTarget() ? "bg-ghost-selected text-icon" : ""}`}
              onClick={() => setActiveRightPanelView(fill.id)}
              onPointerDown={(event) => startFillPointerDrag(event, fill.id)}
              onPointerEnter={(event) => allowPointerFillDrop(event, fill.id)}
              onPointerMove={(event) => allowPointerFillDrop(event, fill.id)}
              onPointerUp={(event) => dropPointerFill(event, fill.id)}
              onDragStart={(event) => writeRightPanelFillDragData(event, fill.id)}
              onDragEnd={() => setDropTargetFillId(null)}
              onDragOver={(event) => allowFillDrop(event, fill.id)}
              onDrop={(event) => dropFill(event, fill.id)}
            >
              {iconForFill(fill.icon, 18)}
            </button>
          );
        }}
      </For>
    </div>
  );
}

export { RightPanelFillButtons };
