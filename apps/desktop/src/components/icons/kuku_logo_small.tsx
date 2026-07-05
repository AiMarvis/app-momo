import { KukuIcon } from "./momo_icon";

interface KukuLogoSmallProps {
  size?: number;
  class?: string;
  isAiResponding?: boolean;
}

export function KukuLogoSmall(props: KukuLogoSmallProps) {
  const size = props.size ?? 20;

  return <KukuIcon size={size} class={props.class} />;
}
