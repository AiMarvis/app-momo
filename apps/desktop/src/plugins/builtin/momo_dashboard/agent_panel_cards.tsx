import { Match, Switch, type JSX } from "solid-js";

import { SparklesIcon } from "~/components/icons";
import type { AgentReceipt } from "~/lib/momo/agent_receipt";
import type { OrganizeInboxResult } from "~/lib/momo/organize_inbox_runtime";

import { AgentReceiptCard } from "./agent_receipt";

interface AgentPanelCopy {
  readonly title: string;
  readonly detail: string;
}

type AgentRunState =
  | { readonly kind: "idle" }
  | { readonly kind: "running" }
  | { readonly kind: "applied"; readonly receipt: AgentReceipt }
  | { readonly kind: "failed"; readonly title: string; readonly detail: string };

function agentRunCopyForResult(
  result: Exclude<OrganizeInboxResult, { readonly status: "applied" }>,
): AgentPanelCopy {
  const detail = result.errors.join("\n");
  switch (result.status) {
    case "invalid_plan":
      return { title: "Plan stopped", detail };
    case "blocked_approval_required":
      return { title: "Needs approval", detail };
    case "rejected_selection":
      return { title: "Choose one Inbox note", detail };
    case "source_conflict":
      return { title: "Source changed", detail };
  }
  return unreachableRunResult(result);
}

function unreachableRunResult(_result: never): AgentPanelCopy {
  throw new Error("Unhandled Organize Inbox result");
}

function AgentActionButton(props: { readonly running: boolean; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xs border border-border bg-bg-primary px-2 py-1.5 text-[0.75rem] font-medium text-text-secondary transition-colors hover:bg-ghost-hover hover:text-text-primary disabled:cursor-default disabled:text-text-muted"
      disabled={props.running}
      onClick={() => props.onClick()}
    >
      <SparklesIcon size={13} />
      <span>{props.running ? "Organizing" : "Organize Inbox"}</span>
    </button>
  );
}

function AgentRunFeedback(props: { readonly state: AgentRunState }) {
  const appliedState = () => (props.state.kind === "applied" ? props.state : null);
  const failedState = () => (props.state.kind === "failed" ? props.state : null);

  return (
    <Switch>
      <Match when={props.state.kind === "running"}>
        <AgentCard title="Organizing" detail="Provider run in progress" />
      </Match>
      <Match when={appliedState()}>
        {(state) => <AgentReceiptCard receipt={state().receipt} />}
      </Match>
      <Match when={failedState()}>
        {(state) => <AgentCard title={state().title} detail={state().detail} />}
      </Match>
    </Switch>
  );
}

function AgentCard(props: {
  readonly title: string;
  readonly detail: string;
  readonly children?: JSX.Element;
}) {
  return (
    <article class="rounded-xs border border-border bg-bg-primary p-3">
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm font-medium text-text-primary">{props.title}</p>
        <span class="size-1.5 rounded-full bg-text-muted" />
      </div>
      <p class="mt-1 text-xs wrap-break-word text-text-muted">{props.detail}</p>
      {props.children}
    </article>
  );
}

export { AgentActionButton, AgentCard, AgentRunFeedback, agentRunCopyForResult };
export type { AgentPanelCopy, AgentRunState };
