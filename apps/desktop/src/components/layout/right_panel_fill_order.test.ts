import type { Component } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SlotFill } from "~/plugins/types";

class StorageMock {
  readonly #store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#store.set(key, value);
  }
}

const EmptyView: Component = () => null;

function installBrowserGlobals(): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: vi.fn(),
      innerWidth: 1440,
      innerHeight: 900,
      removeEventListener: vi.fn(),
    },
  });

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new StorageMock(),
  });
}

function fill(id: string): SlotFill {
  return {
    id,
    pluginId: "test",
    slot: "rightPanel",
    label: id,
    component: EmptyView,
    order: 0,
    isActive: () => true,
  };
}

async function loadOrderModule() {
  vi.resetModules();
  return import("./right_panel_fill_order");
}

describe("right panel fill order", () => {
  beforeEach(() => {
    installBrowserGlobals();
  });

  it("keeps registered order until a right navigation icon is moved", async () => {
    const order = await loadOrderModule();
    const fills = [
      fill("momo-dashboard.calendar"),
      fill("graph-view.panel"),
      fill("ai-chat.panel"),
    ];

    expect(order.orderedRightPanelFills(fills).map((entry) => entry.id)).toEqual([
      "momo-dashboard.calendar",
      "graph-view.panel",
      "ai-chat.panel",
    ]);

    order.placeRightPanelFill("ai-chat.panel", "momo-dashboard.calendar", fills.map((entry) => entry.id));

    expect(order.orderedRightPanelFills(fills).map((entry) => entry.id)).toEqual([
      "ai-chat.panel",
      "momo-dashboard.calendar",
      "graph-view.panel",
    ]);
  });

  it("moves a middle right navigation icon to the end", async () => {
    const order = await loadOrderModule();
    const fills = [
      fill("momo-dashboard.calendar"),
      fill("graph-view.panel"),
      fill("ai-chat.panel"),
    ];

    order.placeRightPanelFill("graph-view.panel", null, fills.map((entry) => entry.id));

    expect(order.rightPanelFillOrderIds()).toEqual([
      "momo-dashboard.calendar",
      "ai-chat.panel",
      "graph-view.panel",
    ]);
    expect(order.orderedRightPanelFills(fills).map((entry) => entry.id)).toEqual([
      "momo-dashboard.calendar",
      "ai-chat.panel",
      "graph-view.panel",
    ]);
  });

  it("keeps order unchanged when a right navigation icon is dropped on itself", async () => {
    const order = await loadOrderModule();
    const fills = [
      fill("momo-dashboard.calendar"),
      fill("graph-view.panel"),
      fill("ai-chat.panel"),
    ];
    const fillIds = fills.map((entry) => entry.id);

    order.placeRightPanelFill("graph-view.panel", "graph-view.panel", fillIds);

    expect(order.rightPanelFillOrderIds()).toEqual([]);
    expect(order.orderedRightPanelFills(fills).map((entry) => entry.id)).toEqual(fillIds);
  });

  it("tracks pointer drag state for right navigation icons", async () => {
    const order = await loadOrderModule();

    order.startRightPanelFillPointerDrag("ai-chat.panel");

    expect(order.readRightPanelFillPointerDrag()).toBe("ai-chat.panel");
    expect(order.parseRightPanelFillId("")).toBeNull();
    expect(order.parseRightPanelFillId("graph-view.panel")).toBe("graph-view.panel");

    order.clearRightPanelFillPointerDrag();
    expect(order.readRightPanelFillPointerDrag()).toBeNull();
  });
});
