import { useCallback, useMemo } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  feedFilterAPI,
  hiddenCountsAPI,
  type FeedFilter,
  type HiddenCounts,
  type SaveFeedFilterRequest,
} from "@/lib/api";
import { queryKeys } from "./keys";

const feedFiltersKey = ["feed-filters"] as const;

const feedFiltersQuery = {
  queryKey: feedFiltersKey,
  queryFn: async () => (await feedFilterAPI.list()).data,
};

export function useFeedFilters() {
  const query = useQuery(feedFiltersQuery);
  const byFeedId = useMemo(
    () => new Map((query.data ?? []).map((f) => [f.feed_id, f])),
    [query.data],
  );
  return { byFeedId, isLoading: query.isLoading };
}

// Nested under feeds so any feeds invalidation (end of a pull, import) also
// refreshes the counts; src/queries/feed-filters.test.ts guards the link.
export const hiddenCountsKey = [...queryKeys.feeds.all, "hidden-counts"] as const;

const hiddenCountsQuery = {
  queryKey: hiddenCountsKey,
  queryFn: async () => (await hiddenCountsAPI.get()).data,
};

export function useHiddenCounts() {
  return useQuery(hiddenCountsQuery).data;
}

export function useFeedHiddenCounts(feedId: number) {
  const select = useCallback(
    (counts: Record<string, HiddenCounts> | undefined) => counts?.[feedId],
    [feedId],
  );
  return useQuery({ ...hiddenCountsQuery, select }).data;
}

// Narrow subscription: the caller redraws only when this feed's entry changes.
export function useFeedFilter(feedId: number) {
  const select = useCallback(
    (filters: FeedFilter[]) => filters.find((f) => f.feed_id === feedId),
    [feedId],
  );
  return useQuery({ ...feedFiltersQuery, select }).data;
}

// Warms both caches at app start so Manage feeds draws its rows once.
export function prefetchFilterViews(qc: QueryClient) {
  return Promise.all([
    qc.prefetchQuery(feedFiltersQuery),
    qc.prefetchQuery(hiddenCountsQuery),
  ]);
}

// A filter change flips stored flags, so counts and lists must reload too.
export function invalidateFilterViews(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: feedFiltersKey }),
    qc.invalidateQueries({ queryKey: queryKeys.feeds.all }),
    qc.invalidateQueries({ queryKey: queryKeys.items.all }),
  ]);
}

export function useSaveFeedFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ feedId, rule }: { feedId: number; rule: SaveFeedFilterRequest }) =>
      feedFilterAPI.save(feedId, rule),
    onSuccess: () => invalidateFilterViews(qc),
  });
}

export function useSetFeedFilterEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ feedId, enabled }: { feedId: number; enabled: boolean }) =>
      feedFilterAPI.setEnabled(feedId, enabled),
    onSuccess: () => invalidateFilterViews(qc),
  });
}

export function useDeleteFeedFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (feedId: number) => feedFilterAPI.delete(feedId),
    onSuccess: () => invalidateFilterViews(qc),
  });
}
