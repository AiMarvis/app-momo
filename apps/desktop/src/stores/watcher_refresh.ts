interface WatcherRefreshScheduler {
  schedule(): void;
  cancel(): void;
}

function createWatcherRefreshScheduler(
  runRefresh: () => Promise<void>,
  delayMs = 120,
): WatcherRefreshScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  let running = false;

  const scheduleTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, delayMs);
  };

  const flush = async () => {
    if (running || !pending) return;

    running = true;
    try {
      while (pending) {
        pending = false;
        await runRefresh();
      }
    } finally {
      running = false;
      if (pending && timer === null) {
        scheduleTimer();
      }
    }
  };

  return {
    schedule() {
      pending = true;
      scheduleTimer();
    },
    cancel() {
      pending = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

export { createWatcherRefreshScheduler };
