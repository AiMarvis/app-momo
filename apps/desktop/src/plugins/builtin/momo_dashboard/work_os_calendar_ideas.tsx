import { For, Show, createSignal } from "solid-js";

import { CloseIcon, PlusIcon } from "~/components/icons";

import {
  createWorkIdea,
  deleteWorkIdea,
  updateWorkIdeaColor,
  updateWorkIdeaPosition,
  updateWorkIdeaText,
  workOsState,
  type WorkColor,
  type WorkIdea,
} from "./work_os_store";
import { BUTTON_CLASS, EmptyRow, INPUT_CLASS, SectionHeader } from "./work_os_dashboard_parts";
import { WorkColorSwatches, workColorStyle } from "./work_os_color_swatches";

interface BoardPoint {
  readonly x: number;
  readonly y: number;
}

interface PointerButtonEvent extends PointerEvent {
  readonly currentTarget: HTMLButtonElement;
}

function IdeaSection() {
  let boardElement: HTMLDivElement | undefined;
  const [ideaText, setIdeaText] = createSignal("");
  const [ideaColor, setIdeaColor] = createSignal<WorkColor>("yellow");
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  const [dragOffset, setDragOffset] = createSignal<BoardPoint>({ x: 0, y: 0 });

  function submitIdea(event: SubmitEvent): void {
    event.preventDefault();
    if (!ideaText().trim()) return;
    createWorkIdea({
      text: ideaText(),
      color: ideaColor(),
      x: nextStickerX(workOsState.ideas.length),
      y: nextStickerY(workOsState.ideas.length),
    });
    setIdeaText("");
  }

  function startDrag(event: PointerButtonEvent, idea: WorkIdea): void {
    const point = boardPointForEvent(event, boardElement);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(idea.id);
    setDragOffset({ x: point.x - idea.x, y: point.y - idea.y });
  }

  function moveDrag(event: PointerButtonEvent, idea: WorkIdea): void {
    if (draggingId() !== idea.id) return;
    const point = boardPointForEvent(event, boardElement);
    if (!point) return;
    const offset = dragOffset();
    updateWorkIdeaPosition(idea.id, clampStickerX(point.x - offset.x), clampStickerY(point.y - offset.y));
  }

  function stopDrag(event: PointerButtonEvent): void {
    if (draggingId()) event.currentTarget.releasePointerCapture(event.pointerId);
    setDraggingId(null);
  }

  return (
    <section class="rounded-xs border border-border bg-bg-secondary/70 p-4" aria-label="Ideas sticker board">
      <SectionHeader title="Ideas" detail="Moveable stickers for raw thoughts" />
      <form class="mt-3 grid gap-2" onSubmit={submitIdea}>
        <textarea
          class={`${INPUT_CLASS} min-h-20 resize-none`}
          aria-label="Idea sticker text"
          value={ideaText()}
          placeholder="Quick idea"
          onInput={(event) => setIdeaText(event.currentTarget.value)}
        />
        <WorkColorSwatches value={ideaColor()} onChange={setIdeaColor} label="New idea color" />
        <button type="submit" class={BUTTON_CLASS}>
          <PlusIcon size={14} />
          <span>Create sticker</span>
        </button>
      </form>

      <div
        ref={boardElement}
        class="relative mt-3 min-h-[28rem] overflow-hidden rounded-xs border border-border bg-bg-primary"
        data-momo-idea-board="true"
      >
        <div class="absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-[size:2rem_2rem] opacity-20" />
        <Show
          when={workOsState.ideas.length > 0}
          fallback={
            <div class="absolute inset-x-3 top-3">
              <EmptyRow label="No idea stickers yet" />
            </div>
          }
        >
          <For each={workOsState.ideas}>
            {(idea) => (
              <IdeaSticker
                idea={idea}
                dragging={draggingId() === idea.id}
                onDelete={() => deleteWorkIdea(idea.id)}
                onStart={startDrag}
                onMove={moveDrag}
                onStop={stopDrag}
              />
            )}
          </For>
        </Show>
      </div>
    </section>
  );
}

function IdeaSticker(props: {
  readonly idea: WorkIdea;
  readonly dragging: boolean;
  readonly onDelete: () => void;
  readonly onStart: (event: PointerButtonEvent, idea: WorkIdea) => void;
  readonly onMove: (event: PointerButtonEvent, idea: WorkIdea) => void;
  readonly onStop: (event: PointerButtonEvent) => void;
}) {
  const colorStyle = () => workColorStyle(props.idea.color);

  return (
    <article
      class="absolute w-[min(10.5rem,62%)] rounded-xs border p-2.5 shadow-none transition-transform"
      classList={{ "z-10 scale-[1.02]": props.dragging }}
      style={{
        left: `${props.idea.x}%`,
        top: `${props.idea.y}%`,
        "background-color": colorStyle().background,
        "border-color": colorStyle().border,
        color: colorStyle().text,
      }}
    >
      <div class="flex items-center justify-between gap-2">
        <button
          type="button"
          class="min-w-0 flex-1 cursor-grab rounded-xs border border-current/25 bg-white/30 px-2 py-1 text-left text-[0.6875rem] font-semibold active:cursor-grabbing"
          aria-label={`Move ${props.idea.text}`}
          onPointerDown={(event) => props.onStart(event, props.idea)}
          onPointerMove={(event) => props.onMove(event, props.idea)}
          onPointerUp={props.onStop}
          onPointerCancel={props.onStop}
        >
          Move
        </button>
        <button
          type="button"
          class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xs border border-current/25 bg-white/30 transition-colors hover:bg-white/55"
          aria-label={`Delete ${props.idea.text}`}
          onClick={props.onDelete}
        >
          <CloseIcon size={12} />
        </button>
      </div>
      <textarea
        class="mt-2 min-h-24 w-full resize-none border-0 bg-transparent p-0 text-sm leading-relaxed outline-none placeholder:text-current/60"
        aria-label={`Text for ${props.idea.text}`}
        value={props.idea.text}
        onChange={(event) => updateWorkIdeaText(props.idea.id, event.currentTarget.value)}
      />
      <div class="mt-2">
        <WorkColorSwatches
          value={props.idea.color}
          onChange={(color) => updateWorkIdeaColor(props.idea.id, color)}
          label={`Color for ${props.idea.text}`}
        />
      </div>
    </article>
  );
}

function boardPointForEvent(event: PointerEvent, element: HTMLDivElement | undefined): BoardPoint | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: ((event.clientX - rect.left) / rect.width) * 100,
    y: ((event.clientY - rect.top) / rect.height) * 100,
  };
}

function nextStickerX(count: number): number {
  return 8 + (count % 3) * 22;
}

function nextStickerY(count: number): number {
  return 8 + (count % 4) * 16;
}

function clampStickerX(value: number): number {
  return Math.min(76, Math.max(0, value));
}

function clampStickerY(value: number): number {
  return Math.min(78, Math.max(0, value));
}

export { IdeaSection };
