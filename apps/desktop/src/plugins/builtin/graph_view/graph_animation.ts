import { createSignal } from "solid-js";

const [graphAnimationReplayRevision, setGraphAnimationReplayRevision] = createSignal(0);

function replayGraphAnimation(): void {
  setGraphAnimationReplayRevision((revision) => revision + 1);
}

export { graphAnimationReplayRevision, replayGraphAnimation };
