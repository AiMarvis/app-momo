import type { IconProps } from "./types";

export function KukuIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      class={props.class}
    >
      <path
        d="M12.3 4.9c1.7-2.1 4.1-2.4 5.9-1.6-.2 2.5-1.8 4.1-4.6 4.5"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M4.2 11.9c0-4.1 3.1-7 7.4-6.6 4.4-.4 7.8 2.5 7.8 6.6 0 4.7-3.4 8.9-7.6 8.9s-7.6-4.2-7.6-8.9Z"
        fill="currentColor"
        opacity="0.16"
      />
      <path
        d="M4.2 11.9c0-4.1 3.1-7 7.4-6.6 4.4-.4 7.8 2.5 7.8 6.6 0 4.7-3.4 8.9-7.6 8.9s-7.6-4.2-7.6-8.9Z"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linejoin="round"
      />
      <path
        d="M10 14.4c.8.8 2.7.8 3.6 0"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <circle cx="9.3" cy="11.2" r="0.85" fill="currentColor" />
      <circle cx="14.3" cy="11.2" r="0.85" fill="currentColor" />
    </svg>
  );
}
