import { create } from "zustand";

const RESULT_MS = 1500;

// starting: request in flight, no pending feed seen yet.
type PullPhase = "idle" | "starting" | "running" | "result";

interface PullState {
  phase: PullPhase;
  done: number;
  total: number;
  // Server-wide new_items count when the run began.
  baseline: number;
  // New articles found, shown in the result phase.
  newItems: number;
  starting: (baseline: number) => void;
  running: (pending: number, serverNewItems: number) => void;
  finish: (newItems: number) => void;
  reset: () => void;
}

let resultTimer: number | undefined;

function clearResultTimer() {
  window.clearTimeout(resultTimer);
}

export const usePullStore = create<PullState>((set, get) => ({
  phase: "idle",
  done: 0,
  total: 0,
  baseline: 0,
  newItems: 0,

  starting: (baseline) => {
    if (get().phase === "starting" || get().phase === "running") return;
    clearResultTimer();
    set({ phase: "starting", done: 0, total: 0, baseline });
  },

  running: (pending, serverNewItems) => {
    const s = get();
    if (s.phase === "idle" || s.phase === "result") {
      clearResultTimer();
      set({
        phase: "running",
        baseline: serverNewItems,
        total: pending,
        done: 0,
      });
      return;
    }
    // Total is the peak pending count, so feeds added mid-run raise it.
    const total = Math.max(s.total, pending);
    set({ phase: "running", total, done: total - pending });
  },

  finish: (newItems) => {
    clearResultTimer();
    set({ phase: "result", newItems });
    resultTimer = window.setTimeout(
      () => set({ phase: "idle", done: 0, total: 0 }),
      RESULT_MS,
    );
  },

  reset: () => {
    clearResultTimer();
    set({ phase: "idle", done: 0, total: 0 });
  },
}));
