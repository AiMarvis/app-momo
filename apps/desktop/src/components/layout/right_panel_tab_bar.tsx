import { type JSX, For, Show, createSignal, onCleanup, onMount } from "solid-js";

import {
  GraphIcon,
  KukuIcon,
  MessageSquareIcon,
  MomoAgentIcon,
  SearchIcon,
  SecondBrainIcon,
} from "~/components/icons";
import { getFills } from "~/plugins/slots";
import {
  isMomoSurfaceActive,
  openMomoSurface,
  type MomoOperationSurfaceId,
} from "~/plugins/builtin/momo_dashboard/navigation";
import {
  clearMomoSurfacePointerDrag,
  parseMomoOperationSurfaceId,
  placeRightMenuSurface,
  readMomoSurfaceDragData,
  readMomoSurfacePointerDrag,
  rightMenuSurfaces,
  startMomoSurfacePointerDrag,
  writeMomoSurfaceDragData,
} from "~/plugins/builtin/momo_dashboard/right_menu_shortcuts";
import { RightPanelFillButtons } from "./right_panel_fill_buttons";
import { orderedRightPanelFills } from "./right_panel_fill_order";

const RIGHT_MENU_DROP_TARGET_ATTR = "data-momo-right-menu-drop-target";

function iconForSurface(surfaceId: MomoOperationSurfaceId, size: number): JSX.Element {
  if (surfaceId === "search") return <SearchIcon size={size} />;
  if (surfaceId === "graph") return <GraphIcon size={size} />;
  if (surfaceId === "ai-chat") return <MessageSquareIcon size={size} />;
  if (surfaceId === "inbox") return <MomoAgentIcon size={size} />;
  if (surfaceId === "knowledge") return <SecondBrainIcon size={size} />;
  return <KukuIcon size={size} />;
}

export default function RightPanelTabBar() {
  const rightPanelFills = () => orderedRightPanelFills(getFills("rightPanel"));
  const [dropTargetSurfaceId, setDropTargetSurfaceId] = createSignal<
    MomoOperationSurfaceId | "end" | null
  >(null);

  onMount(() => {
    const dropSurfaceFromPointerLocation = (event: PointerEvent) => {
      const surfaceId = readMomoSurfacePointerDrag();
      if (!surfaceId) return;

      const target = document.elementFromPoint(event.clientX, event.clientY);
      const dropTarget = target?.closest(`[${RIGHT_MENU_DROP_TARGET_ATTR}]`);
      if (!(dropTarget instanceof HTMLElement)) {
        clearMomoSurfacePointerDrag();
        setDropTargetSurfaceId(null);
        return;
      }

      const rawDropTarget = dropTarget.dataset.momoRightMenuDropTarget;
      const beforeSurfaceId =
        rawDropTarget === "end" ? null : parseMomoOperationSurfaceId(rawDropTarget);
      if (rawDropTarget !== "end" && !beforeSurfaceId) return;

      placeRightMenuSurface(surfaceId, beforeSurfaceId);
      clearMomoSurfacePointerDrag();
      setDropTargetSurfaceId(null);
    };

    window.addEventListener("pointerup", dropSurfaceFromPointerLocation, true);
    onCleanup(() => window.removeEventListener("pointerup", dropSurfaceFromPointerLocation, true));
  });

  function allowSurfaceDrop(event: DragEvent, target: MomoOperationSurfaceId | "end"): void {
    if (!readMomoSurfaceDragData(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const dataTransfer = event.dataTransfer;
    if (dataTransfer) dataTransfer.dropEffect = "move";
    setDropTargetSurfaceId(target);
  }

  function dropSurface(
    event: DragEvent,
    beforeSurfaceId: MomoOperationSurfaceId | null,
  ): void {
    const surfaceId = readMomoSurfaceDragData(event);
    if (!surfaceId) return;

    event.preventDefault();
    event.stopPropagation();
    placeRightMenuSurface(surfaceId, beforeSurfaceId);
    setDropTargetSurfaceId(null);
  }

  function allowPointerSurfaceDrop(
    event: PointerEvent,
    target: MomoOperationSurfaceId | "end",
  ): void {
    if (!readMomoSurfacePointerDrag()) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTargetSurfaceId(target);
  }

  function dropPointerSurface(
    event: PointerEvent,
    beforeSurfaceId: MomoOperationSurfaceId | null,
  ): void {
    const surfaceId = readMomoSurfacePointerDrag();
    if (!surfaceId) return;

    event.preventDefault();
    event.stopPropagation();
    placeRightMenuSurface(surfaceId, beforeSurfaceId);
    clearMomoSurfacePointerDrag();
    setDropTargetSurfaceId(null);
  }

  function startPointerDrag(event: PointerEvent, surfaceId: MomoOperationSurfaceId): void {
    if (event.button === 0) startMomoSurfacePointerDrag(surfaceId);
  }

  return (
    <div class="shrink-0 border-b border-border">
      <div class="flex h-9.5 items-center justify-between px-2">
        <div
          data-momo-right-menu-drop-target="end"
          class="flex min-w-0 items-center gap-0.5"
          onDragOver={(event) => allowSurfaceDrop(event, "end")}
          onDrop={(event) => dropSurface(event, null)}
          onDragLeave={() => setDropTargetSurfaceId(null)}
          onPointerMove={(event) => allowPointerSurfaceDrop(event, "end")}
          onPointerUp={(event) => dropPointerSurface(event, null)}
        >
          <For each={rightMenuSurfaces()}>
            {(entry) => {
              const isActive = () => isMomoSurfaceActive(entry.id);
              const isDropTarget = () => dropTargetSurfaceId() === entry.id;

              return (
                <button
                  data-momo-right-menu-drop-target={entry.id}
                  type="button"
                  title={entry.label}
                  draggable={true}
                  class={`flex size-7 cursor-grab items-center justify-center rounded-xs border-none bg-transparent transition-all duration-100 active:cursor-grabbing ${
                    isActive()
                      ? "text-icon ring-1 ring-border-focused"
                      : "text-icon-muted hover:bg-ghost-hover hover:text-icon"
                  } ${isDropTarget() ? "bg-ghost-selected text-icon" : ""}`}
                  onClick={() => openMomoSurface(entry.id)}
                  onPointerDown={(event) => startPointerDrag(event, entry.id)}
                  onPointerEnter={(event) => allowPointerSurfaceDrop(event, entry.id)}
                  onPointerMove={(event) => allowPointerSurfaceDrop(event, entry.id)}
                  onPointerUp={(event) => dropPointerSurface(event, entry.id)}
                  onDragStart={(event) => writeMomoSurfaceDragData(event, entry.id)}
                  onDragEnd={() => setDropTargetSurfaceId(null)}
                  onDragOver={(event) => allowSurfaceDrop(event, entry.id)}
                  onDrop={(event) => dropSurface(event, entry.id)}
                >
                  {iconForSurface(entry.id, 18)}
                </button>
              );
            }}
          </For>
          <Show when={rightMenuSurfaces().length > 0 && rightPanelFills().length > 0}>
            <div class="mx-1 h-4 w-px bg-border" />
          </Show>
          <RightPanelFillButtons fills={rightPanelFills()} />
        </div>
      </div>
    </div>
  );
}
