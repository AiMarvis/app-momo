import { lazy } from "solid-js";

import type { KukuPlugin } from "~/plugins/types";

import {
  MOMO_CALENDAR_PANEL_ID,
  MOMO_DAILY_TODO_PANEL_ID,
  MOMO_IDEAS_PANEL_ID,
  MOMO_TODAY_TAB_TYPE,
} from "./navigation";

const TodayDashboardView = lazy(() =>
  import("./today_dashboard").then((module) => ({ default: module.TodayDashboard })),
);
const CalendarPanelView = lazy(() =>
  import("./calendar_panel").then((module) => ({ default: module.CalendarPanel })),
);
const DailyTodoPanelView = lazy(() =>
  import("./daily_todo_panel").then((module) => ({ default: module.DailyTodoPanel })),
);
const IdeasPanelView = lazy(() =>
  import("./ideas_panel").then((module) => ({ default: module.IdeasPanel })),
);
const MomoAgentPanelView = lazy(() =>
  import("./agent_panel").then((module) => ({ default: module.MomoAgentPanel })),
);

const momoDashboardPlugin: KukuPlugin = {
  id: "momo-dashboard",
  name: "Momo Dashboard",
  version: "0.1.0",
  description: "Today operating dashboard shell",
  views: [
    {
      id: "momo-dashboard.today",
      label: "Today",
      icon: "kuku",
      location: { slot: "centerTab" },
      tabType: MOMO_TODAY_TAB_TYPE,
      component: TodayDashboardView,
      order: 5,
    },
    {
      id: MOMO_DAILY_TODO_PANEL_ID,
      label: "Daily to-do",
      icon: "list",
      location: { slot: "rightPanel" },
      component: DailyTodoPanelView,
      order: 10,
    },
    {
      id: MOMO_IDEAS_PANEL_ID,
      label: "Ideas",
      icon: "sticky-note",
      location: { slot: "rightPanel" },
      component: IdeasPanelView,
      order: 11,
    },
    {
      id: MOMO_CALENDAR_PANEL_ID,
      label: "Calendar",
      icon: "calendar",
      location: { slot: "rightPanel" },
      component: CalendarPanelView,
      order: 12,
    },
    {
      id: "momo-dashboard.agent",
      label: "Momo Agent",
      icon: "momo-agent",
      location: { slot: "rightPanel" },
      component: MomoAgentPanelView,
      order: 15,
    },
  ],
};

export { momoDashboardPlugin };
