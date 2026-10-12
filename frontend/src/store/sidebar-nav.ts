import { create } from "zustand";

export type SidebarNode =
  | { key: string; kind: "all" }
  | { key: string; kind: "group"; groupId: number }
  | { key: string; kind: "feed"; feedId: number; groupId: number };

export const sidebarNodeKey = {
  all: () => "all",
  group: (groupId: number) => `group:${groupId}`,
  feed: (feedId: number) => `feed:${feedId}`,
};

interface SidebarNavState {
  focusedKey: string | null;
  setFocusedKey: (key: string | null) => void;
  // The ring shows only while the sidebar keys are in use; focusedKey outlives it.
  ringVisible: boolean;
  setRingVisible: (visible: boolean) => void;
}

export const useSidebarNavStore = create<SidebarNavState>((set) => ({
  focusedKey: null,
  setFocusedKey: (key) => set({ focusedKey: key }),
  ringVisible: false,
  // Returning the same state skips listener notification on repeated keydowns.
  setRingVisible: (visible) =>
    set((s) => (s.ringVisible === visible ? s : { ringVisible: visible })),
}));
