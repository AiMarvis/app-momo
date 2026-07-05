interface IconProps {
  size?: number;
  class?: string;
}

export function MomoAgentIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
    >
      <path d="M12 3v3" />
      <path d="M9 3h6" />
      <rect x="5" y="7" width="14" height="11" rx="3" />
      <path d="M8.7 12h.01" />
      <path d="M15.3 12h.01" />
      <path d="M9.5 15c1.4.9 3.6.9 5 0" />
      <path d="M4 12H2.5" />
      <path d="M21.5 12H20" />
      <path d="M18.5 4.5 20 3" />
      <path d="M20.5 6H22" />
    </svg>
  );
}
