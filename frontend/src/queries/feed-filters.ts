import { useMemo } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { feedFilterAPI, type SaveFeedFilterRequest } from "@/lib/api";
import { queryKeys } from "./keys";

const feedFiltersKey = ["feed-filters"] as const;

export function useFeedFilters() {
  const query = useQuery({
    queryKey: feedFiltersKey,
    queryFn: async () => (await feedFilterAPI.list()).data,
  });
  const byFeedId = useMemo(
    () => new Map((query.data ?? []).map((f) => [f.feed_id, f])),
    [query.data],
  );
  return { byFeedId, isLoading: query.isLoading };
}

// A filter change flips stored flags, so counts and lists must reload too.
function invalidateFilterViews(qc: QueryClient) {
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
