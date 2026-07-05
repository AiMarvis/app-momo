import type { AgentPlan, AgentSafeChange } from "./agent_plan_types";

function safeChangesFor(plan: AgentPlan): readonly AgentSafeChange[] {
  const changes: AgentSafeChange[] = [];
  for (const item of plan.creates) {
    if (item.kind === "note_link") {
      changes.push({ kind: "link", itemKind: item.kind, path: item.target });
    } else {
      changes.push({ kind: "create", itemKind: item.kind, path: item.path });
    }
  }
  for (const item of plan.updates) {
    changes.push({ kind: "update_source_note", itemKind: item.kind, path: item.sourceNote });
  }
  return changes;
}

export { safeChangesFor };
