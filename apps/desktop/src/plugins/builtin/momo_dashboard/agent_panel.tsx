import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  Match,
  Show,
  Switch,
} from "solid-js";

import { OpenInTabIcon } from "~/components/icons";
import { openTab } from "~/stores/files";
import { loadFiles, vaultState } from "~/stores/vault";

import {
  AgentActionButton,
  AgentCard,
  AgentRunFeedback,
  type AgentPanelCopy,
  type AgentRunState,
} from "./agent_panel_cards";
import {
  defaultOrganizeInbox,
  runOrganizeForPanel,
  type MomoAgentPanelProps,
} from "./agent_panel_runtime";
import { getInboxAgentState, type InboxAgentState } from "./inbox_capture";

async function loadAgentState(path: string | null): Promise<InboxAgentState> {
  if (path === null) return { kind: "empty" };

  try {
    return await getInboxAgentState([path]);
  } catch (error) {
    if (error instanceof Error) {
      return { kind: "invalid", path, issues: [error.message] };
    }
    throw error;
  }
}

function fileNameFromPath(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function chooseOneAgentCopy(): AgentPanelCopy {
  return {
    title: "Choose one Inbox note",
    detail: "Select exactly one source note under Inbox",
  };
}

function unreachableAgentState(_state: never): AgentPanelCopy {
  throw new Error("Unhandled inbox agent state");
}

function agentPanelCopyForState(state: InboxAgentState): AgentPanelCopy {
  switch (state.kind) {
    case "empty":
    case "not_inbox":
    case "batch_unavailable":
      return chooseOneAgentCopy();
    case "ready":
      return { title: "Idle", detail: state.path };
    case "processed":
      return { title: "Already organized", detail: state.path };
    case "invalid":
      return { title: "Needs attention", detail: "Inbox metadata could not be read" };
  }
  return unreachableAgentState(state);
}

function ViewReceiptButton(props: { agentRun: string }) {
  return (
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-xs border border-border bg-bg-primary px-2 py-1.5 text-left text-[0.75rem] text-text-secondary transition-colors hover:bg-ghost-hover hover:text-text-primary"
      onClick={() => openTab(fileNameFromPath(props.agentRun), props.agentRun, "editor")}
    >
      <OpenInTabIcon size={13} />
      <span>View receipt</span>
    </button>
  );
}

function MomoAgentPanel(props: MomoAgentPanelProps = {}) {
  const [runState, setRunState] = createSignal<AgentRunState>({ kind: "idle" });
  const [agentState, { refetch }] = createResource(() => vaultState.selectedPath, loadAgentState);
  const organizeInbox = props.organizeInbox ?? defaultOrganizeInbox;
  const readyState = createMemo(() => {
    const state = agentState();
    return state?.kind === "ready" ? state : null;
  });
  const processedState = createMemo(() => {
    const state = agentState();
    return state?.kind === "processed" ? state : null;
  });
  const invalidState = createMemo(() => {
    const state = agentState();
    return state?.kind === "invalid" ? state : null;
  });
  const chooseOneCopy = createMemo(() => {
    const state = agentState();
    if (
      state?.kind === "empty" ||
      state?.kind === "not_inbox" ||
      state?.kind === "batch_unavailable"
    ) {
      return agentPanelCopyForState(state);
    }
    return null;
  });

  createEffect((previousPath: string | null | undefined) => {
    const selectedPath = vaultState.selectedPath;
    if (selectedPath !== previousPath) setRunState({ kind: "idle" });
    return selectedPath;
  }, undefined);

  return (
    <section class="flex h-full flex-col bg-bg-secondary" data-momo-surface="agent-panel">
      <div class="border-b border-border px-3 py-2.5">
        <p class="text-[0.6875rem] font-semibold tracking-[0.14em] text-text-muted uppercase">
          Momo Agent
        </p>
        <p class="mt-1 text-xs text-text-secondary">Organize Inbox</p>
      </div>
      <div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        <Show
          when={!agentState.loading}
          fallback={<AgentCard title="Loading" detail="Reading note" />}
        >
          <Switch>
            <Match when={chooseOneCopy()}>
              {(copy) => (
                <>
                  <AgentCard title={copy().title} detail={copy().detail} />
                  <AgentCard title="Idle" detail="Organize Inbox waits for explicit action" />
                </>
              )}
            </Match>
            <Match when={readyState()}>
              {(state) => (
                <AgentCard
                  title={agentPanelCopyForState(state()).title}
                  detail={agentPanelCopyForState(state()).detail}
                >
                  <AgentActionButton
                    running={runState().kind === "running"}
                    onClick={() =>
                      void runOrganizeForPanel({
                        sourceNote: state().path,
                        organizeInbox,
                        rootPath: vaultState.rootPath,
                        reloadVault: loadFiles,
                        refetchAgentState: async () => {
                          await refetch();
                        },
                        setRunState,
                      })
                    }
                  />
                  <AgentRunFeedback state={runState()} />
                </AgentCard>
              )}
            </Match>
            <Match when={processedState()}>
              {(state) => (
                <AgentCard
                  title={agentPanelCopyForState(state()).title}
                  detail={agentPanelCopyForState(state()).detail}
                >
                  <div class="mt-3 grid gap-2">
                    <ViewReceiptButton agentRun={state().agentRun} />
                    <button
                      type="button"
                      class="rounded-xs border border-border bg-bg-primary px-2 py-1.5 text-left text-[0.75rem] text-text-muted"
                      disabled
                    >
                      Undo run
                    </button>
                    <button
                      type="button"
                      class="rounded-xs border border-border bg-bg-primary px-2 py-1.5 text-left text-[0.75rem] text-text-muted"
                      disabled
                    >
                      Re-run organize
                    </button>
                  </div>
                </AgentCard>
              )}
            </Match>
            <Match when={invalidState()}>
              {(state) => (
                <AgentCard
                  title={agentPanelCopyForState(state()).title}
                  detail={agentPanelCopyForState(state()).detail}
                />
              )}
            </Match>
          </Switch>
        </Show>
      </div>
    </section>
  );
}

export { MomoAgentPanel, agentPanelCopyForState };
export type { MomoAgentPanelProps };
