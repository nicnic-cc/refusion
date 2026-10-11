import { useMemo, useCallback } from "react";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
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
        old?.map((f) => (f.id === updated.id ? updated : f)),
      );
      // The backend appends a moved feed to the end of its new group.
      if (previous && previous.group_id !== updated.group_id) {
        qc.invalidateQueries({ queryKey: queryKeys.feeds.list() });
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
      qc.invalidateQueries({ queryKey: queryKeys.feeds.list() });
    },
  });
}
