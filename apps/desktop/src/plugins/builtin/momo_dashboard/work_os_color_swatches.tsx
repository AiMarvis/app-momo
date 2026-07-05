import { For, Show, type JSX } from "solid-js";

import { CheckIcon } from "~/components/icons";

import { WORK_COLORS, type WorkColor } from "./work_os_store";

interface WorkColorStyle {
  readonly label: string;
  readonly background: string;
  readonly border: string;
  readonly text: string;
}

function WorkColorSwatches(props: {
  readonly value: WorkColor;
  readonly onChange: (color: WorkColor) => void;
  readonly label: string;
}) {
  return (
    <div class="flex flex-wrap gap-1" role="group" aria-label={props.label}>
      <For each={WORK_COLORS}>
        {(color) => {
          const style = workColorStyle(color);
          const selected = () => props.value === color;
          return (
            <button
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center rounded-xs border text-[0.6875rem] transition-transform hover:scale-105 focus:outline-none focus:ring-1 focus:ring-border-focused"
              aria-label={`${style.label} color`}
              aria-pressed={selected()}
              title={`${style.label} color`}
              style={swatchStyle(style, selected())}
              onClick={() => props.onChange(color)}
            >
              <Show when={selected()}>
                <CheckIcon size={12} />
              </Show>
            </button>
          );
        }}
      </For>
    </div>
  );
}

function swatchStyle(style: WorkColorStyle, selected: boolean): JSX.CSSProperties {
  return {
    "background-color": style.background,
    "border-color": selected ? style.text : style.border,
    color: style.text,
  };
}

function workColorStyle(color: WorkColor): WorkColorStyle {
  switch (color) {
    case "yellow":
      return {
        label: "Yellow",
        background: "#fef3c7",
        border: "#f59e0b",
        text: "#92400e",
      };
    case "green":
      return {
        label: "Green",
        background: "#dcfce7",
        border: "#22c55e",
        text: "#166534",
      };
    case "blue":
      return {
        label: "Blue",
        background: "#dbeafe",
        border: "#3b82f6",
        text: "#1e40af",
      };
    case "purple":
      return {
        label: "Purple",
        background: "#ede9fe",
        border: "#8b5cf6",
        text: "#5b21b6",
      };
    case "rose":
      return {
        label: "Rose",
        background: "#ffe4e6",
        border: "#fb7185",
        text: "#9f1239",
      };
    case "slate":
      return {
        label: "Slate",
        background: "#e2e8f0",
        border: "#94a3b8",
        text: "#334155",
      };
  }
}

export { WorkColorSwatches, workColorStyle };
