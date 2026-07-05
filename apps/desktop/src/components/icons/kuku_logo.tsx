import { KukuIcon } from "./momo_icon";

interface KukuLogoProps {
  size?: number;
  class?: string;
}

export function KukuLogo(props: KukuLogoProps) {
  const size = props.size ?? 80;

  return <KukuIcon size={size} class={props.class} />;
}
