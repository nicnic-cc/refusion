import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// Per device and never synced. Stores collapsed ids (not open ones) so
// groups created later default to expanded.
interface CollapsedGroupsState {
  collapsedIds: number[];
  setGroupOpen: (groupId: number, open: boolean) => void;
}

export const useCollapsedGroupsStore = create<CollapsedGroupsState>()(
  persist(
    (set) => ({
      collapsedIds: [],
      setGroupOpen: (groupId, open) =>
        set((state) => {
          const rest = state.collapsedIds.filter((id) => id !== groupId);
          return { collapsedIds: open ? rest : [...rest, groupId] };
        }),
    }),
    {
      name: "refusion-collapsed-groups",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ collapsedIds: state.collapsedIds }),
    },
  ),
);
