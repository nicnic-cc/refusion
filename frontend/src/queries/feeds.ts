import { useMemo, useCallback } from "react";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { feedAPI, type Feed } from "@/lib/api";
import { queryKeys } from "./keys";
import { pullQueryKey, useStartPull } from "./pull";

export const feedQueries = {
  list: () =>
    queryOptions({
      queryKey: queryKeys.feeds.list(),
      queryFn: async () => {
        const res = await feedAPI.list();
        return res.data;
      },
    }),
};

export function useFeeds() {
  return useQuery(feedQueries.list());
}

export function useFeedLookup() {
  const { data: feeds = [], isLoading } = useFeeds();

  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds]);

  const getFeedById = useCallback(
    (feedId: number) => feedMap.get(feedId),
    [feedMap],
  );

  const getFeedsByGroup = useCallback(
    (groupId: number) => feeds.filter((f) => f.group_id === groupId),
    [feeds],
  );

  return { feeds, getFeedById, getFeedsByGroup, isLoading };
}

export function useUnreadCounts() {
  const { data: feeds = [] } = useFeeds();

  const getUnreadCount = useCallback(
    (feedId: number) => feeds.find((f) => f.id === feedId)?.unread_count ?? 0,
    [feeds],
  );

  const getGroupUnreadCount = useCallback(
    (groupId: number) =>
      feeds
        .filter((f) => f.group_id === groupId)
        .reduce((sum, f) => sum + (f.unread_count ?? 0), 0),
    [feeds],
  );

  const getTotalUnreadCount = useCallback(
    () => feeds.reduce((sum, f) => sum + (f.unread_count ?? 0), 0),
    [feeds],
  );

  return { getUnreadCount, getGroupUnreadCount, getTotalUnreadCount };
}

// Feed/group-filtered starred lists never go stale on their own (staleTime
// Infinity), so a feed changing group must invalidate them. The unfiltered
// lookup pages through every bookmark and doesn't depend on group membership.
export function invalidateFilteredBookmarkLists(qc: QueryClient) {
  return qc.invalidateQueries({
    queryKey: queryKeys.bookmarks.lists(),
    predicate: (query) => {
      const filters = query.queryKey[2] as
        | { feedId?: number | null; groupId?: number | null }
        | undefined;
      return !!filters && (filters.feedId != null || filters.groupId != null);
    },
  });
}

// A feed changing group changes what every group-scoped items list holds.
// Unscoped and single-feed lists keep the same rows.
export function invalidateGroupItemLists(qc: QueryClient) {
  return qc.invalidateQueries({
    queryKey: queryKeys.items.lists(),
    predicate: (query) => {
      const filters = query.queryKey[2] as
        | { groupId?: number | null }
        | undefined;
      return filters?.groupId != null;
    },
  });
}

export function useCreateFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: Parameters<typeof feedAPI.create>[0]) => {
      const res = await feedAPI.create(req);
      return res.data!;
    },
    onSuccess: (feed) => {
      qc.setQueryData(queryKeys.feeds.list(), (old: Feed[] | undefined) =>
        old ? [...old, feed] : [feed],
      );
      qc.invalidateQueries({ queryKey: pullQueryKey });
    },
  });
}

export function useUpdateFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: Parameters<typeof feedAPI.update>[1] & { id: number }) => {
      const res = await feedAPI.update(id, data);
      return res.data!;
    },
    onSuccess: (updated) => {
      const previous = qc
        .getQueryData<Feed[]>(queryKeys.feeds.list())
        ?.find((f) => f.id === updated.id);
      qc.setQueryData(queryKeys.feeds.list(), (old: Feed[] | undefined) =>
        // The PATCH response has no counts, so keep the cached ones.
        old?.map((f) =>
          f.id === updated.id
            ? {
                ...updated,
                unread_count: f.unread_count,
                item_count: f.item_count,
              }
            : f,
        ),
      );
      // The backend appends a moved feed to the end of its new group.
      if (previous && previous.group_id !== updated.group_id) {
        qc.invalidateQueries({ queryKey: queryKeys.feeds.list() });
        void invalidateFilteredBookmarkLists(qc);
        void invalidateGroupItemLists(qc);
      }
    },
  });
}

export function useDeleteFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await feedAPI.delete(id);
      return id;
    },
    onSuccess: (id) => {
      qc.setQueryData(queryKeys.feeds.list(), (old: Feed[] | undefined) =>
        old?.filter((f) => f.id !== id),
      );
      qc.invalidateQueries({ queryKey: queryKeys.items.all });
      // The server nulls the feed's bookmarks' feed_id and item_id, so every list changes.
      qc.invalidateQueries({ queryKey: queryKeys.bookmarks.all });
    },
  });
}

export function useRefreshFeeds() {
  return useStartPull();
}

export function useMoveFeedsToGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fromGroupId,
      toGroupId,
    }: {
      fromGroupId: number;
      toGroupId: number;
    }) => {
      const feeds = qc.getQueryData<Feed[]>(queryKeys.feeds.list()) ?? [];
      const toMove = feeds.filter((f) => f.group_id === fromGroupId);
      await Promise.all(
        toMove.map((f) => feedAPI.update(f.id, { group_id: toGroupId })),
      );
      return { fromGroupId, toGroupId };
    },
    onSuccess: ({ fromGroupId, toGroupId }) => {
      qc.setQueryData(queryKeys.feeds.list(), (old: Feed[] | undefined) =>
        old?.map((f) =>
          f.group_id === fromGroupId ? { ...f, group_id: toGroupId } : f,
        ),
      );
    },
    // Also on failure: some updates may have landed, so the cache is stale.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.feeds.list() });
      void invalidateFilteredBookmarkLists(qc);
      void invalidateGroupItemLists(qc);
    },
  });
}
