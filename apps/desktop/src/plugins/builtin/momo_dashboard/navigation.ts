import { openRightPanelView } from "~/stores/layout";
import { getActiveTab, openTab } from "~/stores/files";
import { getRightPanelFill } from "~/plugins/slots";
import {
  findInTree,
  isFolderExpanded,
  revealPath,
  setSelectedPath,
  toggleFolder,
  vaultState,
} from "~/stores/vault";
import { layoutState } from "~/stores/layout";

const MOMO_TODAY_TAB_TYPE = "today";
const MOMO_CALENDAR_PANEL_ID = "momo-dashboard.calendar";
const MOMO_DAILY_TODO_PANEL_ID = "momo-dashboard.daily-to-do";
const MOMO_IDEAS_PANEL_ID = "momo-dashboard.ideas";
const MOMO_AGENT_PANEL_ID = "momo-dashboard.agent";
const KNOWLEDGE_PANEL_ID = "knowledge.panel";

const MOMO_OPERATION_ENTRIES = [
  { id: "today", label: "Today", kind: "tab" },
  { id: "inbox", label: "Inbox", kind: "panel" },
  { id: "knowledge", label: "Knowledge", kind: "panel" },
  { id: "search", label: "Search", kind: "tab" },
  { id: "graph", label: "Graph", kind: "tab" },
  { id: "ai-chat", label: "AI Chat", kind: "panel" },
] as const;

const MOMO_RIGHT_MENU_ONLY_ENTRIES = [
  { id: "daily-to-do", label: "Daily to-do", kind: "panel" },
  { id: "ideas", label: "Ideas", kind: "panel" },
  { id: "calendar", label: "Calendar", kind: "panel" },
] as const;

const MOMO_SURFACE_ENTRIES = [...MOMO_OPERATION_ENTRIES, ...MOMO_RIGHT_MENU_ONLY_ENTRIES] as const;

type MomoOperationSurfaceEntry = (typeof MOMO_OPERATION_ENTRIES)[number];
type MomoOperationSurfaceId = MomoOperationSurfaceEntry["id"];
type MomoSurfaceEntry = (typeof MOMO_SURFACE_ENTRIES)[number];
type MomoSurfaceId = MomoSurfaceEntry["id"];

function assertNever(_value: never): never {
  throw new Error("Unhandled Momo surface");
}

function getMomoSurfaceEntry(surfaceId: MomoSurfaceId): MomoSurfaceEntry {
  const entry = MOMO_SURFACE_ENTRIES.find((candidate) => candidate.id === surfaceId);
  if (entry) return entry;
  throw new Error("Unknown Momo surface");
}

function getMomoOperationSurfaceEntry(
  surfaceId: MomoOperationSurfaceId,
): MomoOperationSurfaceEntry {
  const entry = MOMO_OPERATION_ENTRIES.find((candidate) => candidate.id === surfaceId);
  if (entry) return entry;
  throw new Error("Unknown Momo operation surface");
}

function openMomoFolder(path: string): boolean {
  const entry = findInTree(vaultState.files, path);
  if (!vaultState.rootPath || !entry?.is_directory) return false;

  setSelectedPath(path);
  revealPath(path);
  if (!isFolderExpanded(path)) toggleFolder(path);
  return true;
}

function openKnowledgeSurface(): void {
  if (getRightPanelFill(KNOWLEDGE_PANEL_ID) || !openMomoFolder("Knowledge")) {
    openRightPanelView(KNOWLEDGE_PANEL_ID);
  }
}

function openMomoSurface(surfaceId: MomoSurfaceId): void {
  switch (surfaceId) {
    case "today":
      openTab("Today", null, MOMO_TODAY_TAB_TYPE);
      return;
    case "calendar":
      openRightPanelView(MOMO_CALENDAR_PANEL_ID);
      return;
    case "daily-to-do":
      openRightPanelView(MOMO_DAILY_TODO_PANEL_ID);
      return;
    case "ideas":
      openRightPanelView(MOMO_IDEAS_PANEL_ID);
      return;
    case "inbox":
      openRightPanelView(MOMO_AGENT_PANEL_ID);
      return;
    case "knowledge":
      openKnowledgeSurface();
      return;
    case "search":
      openTab("Advanced Search", null, "search");
      return;
    case "graph":
      openTab("Graph", null, "graph");
      return;
    case "ai-chat":
      openRightPanelView("ai-chat.panel");
      return;
    default:
      assertNever(surfaceId);
  }
}

function isMomoSurfaceActive(surfaceId: MomoSurfaceId): boolean {
  const activeTab = getActiveTab();
  switch (surfaceId) {
    case "today":
      return activeTab?.type === MOMO_TODAY_TAB_TYPE;
    case "calendar":
      return layoutState.rightPanelOpen && layoutState.activeRightPanelViewId === MOMO_CALENDAR_PANEL_ID;
    case "daily-to-do":
      return (
        layoutState.rightPanelOpen && layoutState.activeRightPanelViewId === MOMO_DAILY_TODO_PANEL_ID
      );
    case "ideas":
      return layoutState.rightPanelOpen && layoutState.activeRightPanelViewId === MOMO_IDEAS_PANEL_ID;
    case "search":
      return activeTab?.type === "search";
    case "graph":
      return activeTab?.type === "graph";
    case "ai-chat":
      return layoutState.rightPanelOpen && layoutState.activeRightPanelViewId === "ai-chat.panel";
    case "inbox":
      return (
        layoutState.rightPanelOpen && layoutState.activeRightPanelViewId === MOMO_AGENT_PANEL_ID
      );
    case "knowledge":
      return layoutState.rightPanelOpen && layoutState.activeRightPanelViewId === KNOWLEDGE_PANEL_ID;
    default:
      return assertNever(surfaceId);
  }
}

export {
  MOMO_CALENDAR_PANEL_ID,
  MOMO_DAILY_TODO_PANEL_ID,
  MOMO_IDEAS_PANEL_ID,
  MOMO_OPERATION_ENTRIES,
  MOMO_SURFACE_ENTRIES,
  MOMO_TODAY_TAB_TYPE,
  assertNever,
  getMomoOperationSurfaceEntry,
  getMomoSurfaceEntry,
  isMomoSurfaceActive,
  openMomoSurface,
};
export type { MomoOperationSurfaceEntry, MomoOperationSurfaceId, MomoSurfaceEntry, MomoSurfaceId };
