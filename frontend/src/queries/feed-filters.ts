import { useCallback, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  feedFilterAPI,
  groupFilterAPI,
  hiddenCountsAPI,
  type FeedFilter,
  type GroupFilter,
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

const groupFiltersKey = ["group-filters"] as const;

const groupFiltersQuery = {
  queryKey: groupFiltersKey,
  queryFn: async () => (await groupFilterAPI.list()).data,
};

// Narrow subscription, like useFeedFilter.
export function useGroupFilter(groupId: number) {
  const select = useCallback(
    (filters: GroupFilter[]) => filters.find((f) => f.group_id === groupId),
    [groupId],
  );
  return useQuery({ ...groupFiltersQuery, select }).data;
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

// Warms the filter caches at app start so Manage feeds draws its rows once.
export function prefetchFilterViews(qc: QueryClient) {
  return Promise.all([
    qc.prefetchQuery(feedFiltersQuery),
    qc.prefetchQuery(groupFiltersQuery),
    qc.prefetchQuery(hiddenCountsQuery),
  ]);
}

// A filter change flips stored flags, so counts and lists must reload too.
export function invalidateFilterViews(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: feedFiltersKey }),
    qc.invalidateQueries({ queryKey: groupFiltersKey }),
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

// Several switches can be in flight at once. TanStack drops the per-call
// callbacks of a superseded mutate(), so each call settles through its own
// mutateAsync promise and the pending feeds are counted here.
export function useSetFeedFilterEnabled() {
  const qc = useQueryClient();
  const [pending, setPending] = useState<ReadonlyMap<number, number>>(
    new Map(),
  );
  const { mutateAsync } = useMutation({
    mutationFn: ({ feedId, enabled }: { feedId: number; enabled: boolean }) =>
      feedFilterAPI.setEnabled(feedId, enabled),
    onSuccess: () => invalidateFilterViews(qc),
  });
  const mutate = useCallback(
    (
      variables: { feedId: number; enabled: boolean },
      options?: { onError?: (error: Error) => void },
    ) => {
      const track = (delta: 1 | -1) =>
        setPending((prev) => {
          const next = new Map(prev);
          const count = (prev.get(variables.feedId) ?? 0) + delta;
          if (count > 0) next.set(variables.feedId, count);
          else next.delete(variables.feedId);
          return next;
        });
      track(1);
      mutateAsync(variables)
        .catch((error: Error) => options?.onError?.(error))
        .finally(() => track(-1));
    },
    [mutateAsync],
  );
  const pendingFeedIds = useMemo(() => new Set(pending.keys()), [pending]);
  return { mutate, pendingFeedIds };
}

export function useDeleteFeedFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (feedId: number) => feedFilterAPI.delete(feedId),
    onSuccess: () => invalidateFilterViews(qc),
  });
}

export function useSaveGroupFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      rule,
    }: {
      groupId: number;
      rule: SaveFeedFilterRequest;
    }) => groupFilterAPI.save(groupId, rule),
    onSuccess: () => invalidateFilterViews(qc),
  });
}

export function useSetGroupFilterEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, enabled }: { groupId: number; enabled: boolean }) =>
      groupFilterAPI.setEnabled(groupId, enabled),
    onSuccess: () => invalidateFilterViews(qc),
  });
}

export function useDeleteGroupFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: number) => groupFilterAPI.delete(groupId),
    onSuccess: () => invalidateFilterViews(qc),
  });
}
