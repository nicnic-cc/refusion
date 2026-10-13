import { create } from "zustand";

/**
 * Feeds whose "mark all read" waits out an undo window. Timers live outside
 * the state so only the pending flags trigger renders. Not persisted: a mark
 * still waiting when the tab closes is sent by its flush on pagehide.
 */
export const UNDO_WINDOW_MS = 5000;

interface PendingMark {
  timer: ReturnType<typeof setTimeout>;
  flush: () => void;
}

const marks = new Map<number, PendingMark>();
let pagehideBound = false;

interface PendingFeedReadsState {
  pending: Record<number, true>;
  schedule: (
    feedId: number,
    actions: { commit: () => void; flush: () => void },
  ) => void;
  cancel: (feedId: number) => void;
}

export const usePendingFeedReadsStore = create<PendingFeedReadsState>()(
  (set, get) => ({
    pending: {},
    schedule: (feedId, { commit, flush }) => {
      clearTimeout(marks.get(feedId)?.timer);
      marks.set(feedId, {
        timer: setTimeout(() => {
          get().cancel(feedId);
          commit();
        }, UNDO_WINDOW_MS),
        flush,
      });
      set((s) => ({ pending: { ...s.pending, [feedId]: true } }));
      bindPagehide(get);
    },
    cancel: (feedId) => {
      clearTimeout(marks.get(feedId)?.timer);
      marks.delete(feedId);
      set((s) => {
        const rest = { ...s.pending };
        delete rest[feedId];
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
    for (const feedId of [...marks.keys()]) get().cancel(feedId);
    for (const flush of flushes) flush();
  });
}

export const useIsFeedReadPending = (feedId: number) =>
  usePendingFeedReadsStore((s) => s.pending[feedId] === true);
