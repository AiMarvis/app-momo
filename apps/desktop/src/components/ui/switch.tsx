import { Switch as KSwitch } from "@kobalte/core/switch";
import { type JSX, createEffect, createSignal, splitProps } from "solid-js";

// ── Types ──

interface SwitchProps {
  /** Whether the switch is on */
  checked?: boolean;
  /** Default checked state (uncontrolled) */
  defaultChecked?: boolean;
  /** Called when the checked state changes */
  onChange?: (checked: boolean) => void;
  /** Whether the switch is disabled */
  disabled?: boolean;
  /** Accessible label */
  label?: string;
  /** Form field name */
  name?: string;
  /** Additional class on the root */
  class?: string;
  children?: JSX.Element;
}

// ── Component ──

/**
 * Horizontal rocker switch built on Kobalte's Switch primitive.
 *
 * Visual concept:
 *   - A flat rectangular plate split into two halves by a center pivot.
 *   - Clicking tilts the plate so the active side presses down while
 *     the opposite side lifts up — mimicking a physical rocker switch.
 *   - The ON (right) side shows the accent colour when pressed.
 *
 * The 3D tilt is achieved with CSS `perspective` + `rotateY`, and
 * a cubic-bezier overshoot curve sells the mechanical "snap".
 *
 * @example
 * ```tsx
 * <Switch checked={enabled()} onChange={setEnabled} label="Auto-save" />
 * ```
 */
export default function Switch(props: SwitchProps) {
  const [local, rest] = splitProps(props, [
    "checked",
    "defaultChecked",
    "onChange",
    "disabled",
    "label",
    "name",
    "class",
    "children",
  ]);

  // Internal signal keeps styling in sync for both controlled & uncontrolled modes.
  const [isOn, setIsOn] = createSignal(local.checked ?? local.defaultChecked ?? false);

  // Sync with controlled `checked` prop when it changes externally.
  createEffect(() => {
    if (local.checked !== undefined) setIsOn(local.checked);
  });

  function handleChange(checked: boolean) {
    setIsOn(checked);
    local.onChange?.(checked);
  }

  return (
    <KSwitch
      checked={local.checked}
      defaultChecked={local.defaultChecked}
      onChange={handleChange}
      disabled={local.disabled}
      name={local.name}
      class={`inline-flex items-center gap-2 ${local.class ?? ""}`}
      {...rest}
    >
      <KSwitch.Input class="sr-only" />

      {/* ── Rocker housing ── */}
      <KSwitch.Control
        class={[
          "relative flex h-5 w-10 shrink-0 cursor-pointer overflow-hidden rounded-xs",
          "border border-border/60 bg-bg-secondary",
          "transition-shadow duration-150",
          "hover:border-border",
          "active:scale-[0.97]",
          "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        ].join(" ")}
        style={{ perspective: "300px" }}
      >
        {/* ── Rocker plate (tilts L/R) ── */}
        <span
          class="flex size-full"
          style={{
            transform: isOn() ? "rotateY(7deg)" : "rotateY(-7deg)",
            "transform-style": "preserve-3d",
            // Overshoot curve → mechanical snap feel
            transition: "transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          {/* OFF side (left) — pressed when unchecked */}
          <span
            class="flex flex-1 items-center justify-center transition-all duration-150"
            classList={{
              "bg-element shadow-[inset_0_1px_4px_rgba(0,0,0,0.3)]": !isOn(),
              "bg-bg-secondary/80": isOn(),
            }}
          >
            <span
              class="text-[0.5rem] leading-none font-bold transition-colors duration-150 select-none"
              classList={{
                "text-text-muted/70": !isOn(),
                "text-text-muted/25": isOn(),
              }}
            >
              O
            </span>
          </span>

          {/* Center pivot ridge */}
          <span class="w-px shrink-0 bg-border/40" />

          {/* ON side (right) — pressed when checked */}
          <span
            class="flex flex-1 items-center justify-center transition-all duration-150"
            classList={{
              "bg-bg-secondary/80": !isOn(),
              "bg-accent shadow-[inset_0_1px_4px_rgba(0,0,0,0.3)]": isOn(),
            }}
          >
            <span
              class="text-[0.5rem] leading-none font-bold transition-colors duration-150 select-none"
              classList={{
                "text-text-muted/25": !isOn(),
                "text-white/80": isOn(),
              }}
            >
              I
            </span>
          </span>
        </span>

        {/* Kobalte Thumb — visually hidden, present for a11y internals */}
        <KSwitch.Thumb class="sr-only" />
      </KSwitch.Control>

      {local.label && (
        <KSwitch.Label class="cursor-pointer text-[0.8125rem] leading-normal text-text-primary data-disabled:cursor-not-allowed data-disabled:text-text-disabled">
          {local.label}
        </KSwitch.Label>
      )}
      {local.children}
    </KSwitch>
  );
}

/** Re-export Kobalte sub-components for advanced composition */
export const SwitchLabel = KSwitch.Label;
export const SwitchDescription = KSwitch.Description;
