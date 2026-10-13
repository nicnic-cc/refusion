import { useCallback } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { feedWebCSSAPI, itemAPI, type FeedWebCSS } from "@/lib/api";

const feedWebCSSKey = ["feed-web-css"] as const;

const feedWebCSSQuery = {
  queryKey: feedWebCSSKey,
  queryFn: async () => (await feedWebCSSAPI.list()).data,
};

// Narrow subscription: the caller redraws only when this feed's entry changes.
export function useFeedWebCSS(feedId: number | undefined) {
  const select = useCallback(
    (list: FeedWebCSS[]) => list.find((c) => c.feed_id === feedId),
    [feedId],
  );
  return useQuery({ ...feedWebCSSQuery, select, enabled: feedId !== undefined })
    .data;
}

// The reader's web view iframe keys on updated_at, so it must not first load
// without it and then reload.
export function prefetchFeedWebCSS(qc: QueryClient) {
  return qc.prefetchQuery(feedWebCSSQuery);
}

// Newest item of the feed, read or filtered out, so a fully read feed still
// previews. Kept out of the items cache: nothing here is shown in a list.
export function useNewestFeedItem(feedId: number, enabled: boolean) {
  return useQuery({
    queryKey: [...feedWebCSSKey, "newest-item", feedId],
    queryFn: async () => {
      const res = await itemAPI.list({
        feed_id: feedId,
        limit: 1,
        order_by: "pub_date",
        include_filtered: true,
      });
      return res.data[0] ?? null;
    },
    enabled,
    gcTime: 0,
  });
}

export function useSaveFeedWebCSS() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ feedId, css }: { feedId: number; css: string }) =>
      feedWebCSSAPI.save(feedId, css),
    onSuccess: () => qc.invalidateQueries({ queryKey: feedWebCSSKey }),
  });
}

export function useDeleteFeedWebCSS() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (feedId: number) => feedWebCSSAPI.delete(feedId),
    onSuccess: () => qc.invalidateQueries({ queryKey: feedWebCSSKey }),
  });
}
