import { useEffect } from "react";
import { create } from "zustand";
import { useFeedFilters } from "@/queries/feed-filters";

// View state only (not in the URL): remembers the one feed whose list also
// shows filtered articles.
const useShowFilteredStore = create<{
  feedId: number | null;
  setFeedId: (feedId: number | null) => void;
}>()((set) => ({
  feedId: null,
  setFeedId: (feedId) => set({ feedId }),
}));

/** True when this feed has a filter that is switched on, i.e. hides something. */
export function useFeedHasActiveFilter(feedId: number | null) {
  const { byFeedId } = useFeedFilters();
  return feedId !== null && byFeedId.get(feedId)?.enabled === true;
}

/** Whether the list of this feed should also request filtered articles. */
export function useIncludeFiltered(feedId: number | null) {
  const selected = useShowFilteredStore(
    (s) => feedId !== null && s.feedId === feedId,
  );
  const hasFilter = useFeedHasActiveFilter(feedId);
  return selected && hasFilter;
}

/** Toggle state for the list header. */
export function useShowFilteredToggle(feedId: number | null) {
  const active = useShowFilteredStore(
    (s) => feedId !== null && s.feedId === feedId,
  );
  const setFeedId = useShowFilteredStore((s) => s.setFeedId);

  // Off when the viewed feed changes or the list closes (e.g. Manage feeds).
  useEffect(() => () => setFeedId(null), [feedId, setFeedId]);

  return {
    active,
    toggle: () => setFeedId(active || feedId === null ? null : feedId),
  };
}
