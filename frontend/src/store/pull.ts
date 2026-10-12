import { create } from "zustand";
import type { StartPullRequest } from "@/lib/api";

const RESULT_MS = 1500;

// starting: request in flight, no pending feed seen yet.
type PullPhase = "idle" | "starting" | "running" | "result";

// Which pane started the run; null for runs only seen through status
// (add feed, import, Refresh All).
export type PullPane = "sidebar" | "list" | null;

interface PullState {
  phase: PullPhase;
  pane: PullPane;
  // What the mounted article list would check; null when none, or on Starred.
  listScope: StartPullRequest | null;
  setListScope: (scope: StartPullRequest | null) => void;
  // Whether the mounted article list is scrolled to the top.
  listAtTop: boolean;
  setListAtTop: (atTop: boolean) => void;
  done: number;
  total: number;
  // Server-wide new_items count when the run began.
  baseline: number;
  // New articles found, shown in the result phase.
  newItems: number;
  starting: (baseline: number, pane: PullPane) => void;
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
  pane: null,
  listScope: null,
  done: 0,
  total: 0,
  baseline: 0,
  newItems: 0,

  setListScope: (listScope) => set({ listScope }),

  listAtTop: true,
  setListAtTop: (listAtTop) => {
    if (get().listAtTop !== listAtTop) set({ listAtTop });
  },

  starting: (baseline, pane) => {
    if (get().phase === "starting" || get().phase === "running") return;
    clearResultTimer();
    set({ phase: "starting", pane, done: 0, total: 0, baseline });
  },

  running: (pending, serverNewItems) => {
    const s = get();
    if (s.phase === "idle" || s.phase === "result") {
      clearResultTimer();
      set({
        phase: "running",
        pane: null,
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
      () => set({ phase: "idle", pane: null, done: 0, total: 0 }),
      RESULT_MS,
    );
  },

  reset: () => {
    clearResultTimer();
    set({ phase: "idle", pane: null, done: 0, total: 0 });
  },
}));
