import { type JSX, For } from "solid-js";

import {
  FolderIcon,
  GraphIcon,
  KukuIcon,
  MessageSquareIcon,
  SearchIcon,
} from "~/components/icons";

import {
  MOMO_OPERATION_ENTRIES,
  assertNever,
  isMomoSurfaceActive,
  openMomoSurface,
  type MomoOperationSurfaceId,
} from "./navigation";
import {
  startMomoSurfacePointerDrag,
  writeMomoSurfaceDragData,
} from "./right_menu_shortcuts";

function iconForSurface(surfaceId: MomoOperationSurfaceId): JSX.Element {
  switch (surfaceId) {
    case "today":
      return <KukuIcon size={14} />;
    case "search":
      return <SearchIcon size={14} />;
    case "graph":
      return <GraphIcon size={14} />;
    case "ai-chat":
      return <MessageSquareIcon size={14} />;
    case "inbox":
    case "knowledge":
      return <FolderIcon size={14} />;
    default:
      return assertNever(surfaceId);
  }
}

function MomoOperationalNav() {
  return (
    <nav class="border-b border-border p-2" aria-label="Momo operations">
      <div class="mb-1.5 px-1 text-[0.625rem] font-semibold tracking-[0.16em] text-text-muted uppercase">
        Momo
      </div>
      <div class="grid grid-cols-2 gap-1">
        <For each={MOMO_OPERATION_ENTRIES}>
          {(entry) => {
            const active = () => isMomoSurfaceActive(entry.id);
            return (
              <button
                type="button"
                draggable={true}
                class="flex min-w-0 items-center gap-1.5 rounded-xs px-2 py-1.5 text-left text-[0.75rem] text-text-secondary transition-colors hover:bg-ghost-hover hover:text-text-primary"
                classList={{ "bg-list-active text-text-primary": active() }}
                onClick={() => openMomoSurface(entry.id)}
                onPointerDown={(event) => {
                  if (event.button === 0) startMomoSurfacePointerDrag(entry.id);
                }}
                onDragStart={(event) => writeMomoSurfaceDragData(event, entry.id)}
              >
                <span class={active() ? "shrink-0 text-icon" : "shrink-0 text-icon-muted"}>
                  {iconForSurface(entry.id)}
                </span>
                <span class="min-w-0 truncate">{entry.label}</span>
              </button>
            );
          }}
        </For>
      </div>
    </nav>
  );
}

export { MomoOperationalNav };
