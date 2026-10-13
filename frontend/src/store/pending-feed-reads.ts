import { create } from "zustand";

/**
 * Scopes whose "mark all read" waits out an undo window, keyed "feed:<id>",
 * "group:<id>", "all" or "starred". Timers live outside the state so only the
 * pending flags trigger renders. Not persisted: a mark still waiting when the
 * tab closes is sent by its flush on pagehide.
 */
export const UNDO_WINDOW_MS = 5000;

interface PendingMark {
  timer: ReturnType<typeof setTimeout>;
  flush: () => void;
}

export const pendingScope = {
  feed: (id: number) => `feed:${id}`,
  group: (id: number) => `group:${id}`,
  all: "all",
  starred: "starred",
};

const marks = new Map<string, PendingMark>();
let pagehideBound = false;

interface PendingFeedReadsState {
  pending: Record<string, true>;
  schedule: (
    scope: string,
    actions: { commit: () => void; flush: () => void },
  ) => void;
  cancel: (scope: string) => void;
}

export const usePendingFeedReadsStore = create<PendingFeedReadsState>()(
  (set, get) => ({
    pending: {},
    schedule: (scope, { commit, flush }) => {
      clearTimeout(marks.get(scope)?.timer);
      marks.set(scope, {
        timer: setTimeout(() => {
          get().cancel(scope);
          commit();
        }, UNDO_WINDOW_MS),
        flush,
      });
      set((s) => ({ pending: { ...s.pending, [scope]: true } }));
      bindPagehide(get);
    },
    cancel: (scope) => {
      clearTimeout(marks.get(scope)?.timer);
      marks.delete(scope);
      set((s) => {
        const rest = { ...s.pending };
        delete rest[scope];
        return { pending: rest };
      });
    },
  }),
);

// The page may be gone before the undo window ends; flushes use keepalive
// requests, which outlive it. Each entry is cleared first so nothing sends twice.
function bindPagehide(get: () => PendingFeedReadsState) {
  if (pagehideBound || typeof window === "undefined") return;
  pagehideBound = true;
  window.addEventListener("pagehide", () => {
    const flushes = [...marks.values()].map((m) => m.flush);
    for (const scope of [...marks.keys()]) get().cancel(scope);
    for (const flush of flushes) flush();
  });
}

export const useIsScopePending = (scope: string) =>
  usePendingFeedReadsStore((s) => s.pending[scope] === true);

/** True when a pending mark of the feed itself, its group or all covers it. */
export function isFeedCovered(
  pending: Record<string, true>,
  feed: { id: number; group_id: number },
) {
  return (
    pending[pendingScope.all] === true ||
    pending[pendingScope.feed(feed.id)] === true ||
    pending[pendingScope.group(feed.group_id)] === true
  );
}

export const useIsFeedCovered = (feed: { id: number; group_id: number }) =>
  usePendingFeedReadsStore((s) => isFeedCovered(s.pending, feed));
