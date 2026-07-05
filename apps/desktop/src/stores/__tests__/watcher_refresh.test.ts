import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWatcherRefreshScheduler } from "~/stores/watcher_refresh";

function callIfPresent(fn: (() => void) | null): void {
  if (fn) {
    fn();
  }
}

describe("watcher refresh scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces multiple quick schedules into one refresh", async () => {
    const runRefresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createWatcherRefreshScheduler(runRefresh, 40);

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();

    await vi.advanceTimersByTimeAsync(39);
    expect(runRefresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(runRefresh).toHaveBeenCalledTimes(1);
  });

  it("runs a trailing refresh when new events arrive during an in-flight refresh", async () => {
    let resolveFirst: (() => void) | null = null;
    const runRefresh = vi.fn<() => Promise<void>>().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          if (resolveFirst) {
            resolve();
            return;
          }
          resolveFirst = () => {
            resolve();
          };
        }),
    );
    const scheduler = createWatcherRefreshScheduler(runRefresh, 40);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(40);
    expect(runRefresh).toHaveBeenCalledTimes(1);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(40);
    expect(runRefresh).toHaveBeenCalledTimes(1);

    callIfPresent(resolveFirst);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(40);
    expect(runRefresh).toHaveBeenCalledTimes(2);
  });
});
