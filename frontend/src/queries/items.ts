import {
  infiniteQueryOptions,
  queryOptions,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  itemAPI,
  type Feed,
  type Item,
  type ListItemsParams,
  type MarkScopeReadRequest,
} from "@/lib/api";
import {
  normalizeItemFilters,
  queryKeys,
  type ItemFilters,
  type NormalizedItemFilters,
} from "./keys";
import { usePreferencesStore } from "@/store";
import type { ArticleFilter } from "@/lib/article-filter";
import type { BookmarksInfiniteData } from "./bookmarks";

type ItemListResponse = Awaited<ReturnType<typeof itemAPI.list>>;
type ItemsInfiniteData = InfiniteData<ItemListResponse, string | null>;
type ItemsMutationContext = {
  prevItemLists: Array<[readonly unknown[], ItemsInfiniteData | undefined]>;
  prevItemDetails: Array<readonly [number, Item | undefined]>;
  prevFeeds: Feed[] | undefined;
  prevBookmarkLists: Array<
    [readonly unknown[], BookmarksInfiniteData | undefined]
  >;
  // Set by onError so a late re-apply does not undo the rollback.
  failed: boolean;
};

function buildListItemsParams(
  filters: NormalizedItemFilters,
  cursor: string | null,
  pageSize: number,
): ListItemsParams {
  const params: ListItemsParams = {
    limit: pageSize,
    order_by: "pub_date",
  };

  if (filters.feedId) params.feed_id = filters.feedId;
  if (filters.groupId) params.group_id = filters.groupId;
  if (filters.unread) params.unread = true;
  if (filters.includeFiltered) params.include_filtered = true;
  if (cursor) params.before = cursor;

  return params;
}

export const itemQueries = {
  list: (filters: ItemFilters, pageSize: number) => {
    const normalizedFilters = normalizeItemFilters(filters);

    return infiniteQueryOptions({
      queryKey: [...queryKeys.items.lists(), normalizedFilters, pageSize],
      queryFn: async ({ pageParam }) =>
        itemAPI.list(buildListItemsParams(normalizedFilters, pageParam, pageSize)),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
      // Undocumented in v5 for observers (query-core reads it in
      // infiniteQueryBehavior): a refetch asks for 1 page, not all loaded
      // ones; fetchNextPage is unaffected. Guarded by items-refetch.test.tsx.
      ...({ pages: 1 } as object),
      // Coming back online must not move the list being read; the pill offers
      // the reload. Guarded by items-refetch.test.tsx.
      refetchOnReconnect: false,
    });
  },
  detail: (itemId: number) =>
    queryOptions({
      queryKey: queryKeys.items.detail(itemId),
      queryFn: async () => {
        const res = await itemAPI.get(itemId);
        return res.data;
      },
    }),
};

export function useItems(filters: ItemFilters, enabled = true) {
  const articlePageSize = usePreferencesStore((state) => state.articlePageSize);
  return useInfiniteQuery({ ...itemQueries.list(filters, articlePageSize), enabled });
}

/**
 * Starts the first page of a list before the route opens it, so the list
 * joins the in-flight request instead of starting its own.
 */
export function prefetchItemList(
  qc: QueryClient,
  target: { feedId: number | null; groupId: number | null },
  articleFilter: ArticleFilter,
) {
  // The starred view shows bookmarks and makes no items request.
  if (articleFilter === "starred") return;

  const options = itemQueries.list(
    {
      ...target,
      unread: articleFilter === "unread" ? true : undefined,
      // A newly opened feed or group always starts without filtered rows.
      includeFiltered: false,
    },
    usePreferencesStore.getState().articlePageSize,
  );
  // Cached lists (even stale) keep today's behaviour: shown, then refetched.
  if (qc.getQueryData(options.queryKey) !== undefined) return;
  void qc.prefetchInfiniteQuery(options);
}

export function useItem(itemId: number | null, enabled = true) {
  return useQuery({
    ...itemQueries.detail(itemId ?? 0),
    enabled: enabled && itemId !== null && itemId > 0,
  });
}

function snapshotItemsMutationState(
  qc: QueryClient,
  ids: number[],
): ItemsMutationContext {
  return {
    prevItemLists: qc.getQueriesData<ItemsInfiniteData>({
      queryKey: queryKeys.items.lists(),
    }),
    prevItemDetails: ids.map(
      (id) =>
        [id, qc.getQueryData<Item>(queryKeys.items.detail(id))] as const,
    ),
    prevFeeds: qc.getQueryData<Feed[]>(queryKeys.feeds.list()),
    prevBookmarkLists: qc.getQueriesData<BookmarksInfiniteData>({
      queryKey: queryKeys.bookmarks.lists(),
    }),
    failed: false,
  };
}

// Cancels only what the optimistic update overwrites. A next-page load is
// kept: it appends a page and does not replace the rows being flipped.
function cancelOptimisticTargets(qc: QueryClient, ids: number[]) {
  const idSet = new Set(ids);
  return Promise.all([
    qc.cancelQueries({
      queryKey: queryKeys.items.lists(),
      predicate: (query) => !query.state.fetchMeta?.fetchMore,
    }),
    qc.cancelQueries({
      queryKey: queryKeys.items.details(),
      predicate: (query) => idSet.has(query.queryKey[2] as number),
    }),
    qc.cancelQueries({ queryKey: queryKeys.feeds.all }),
  ]);
}

function applyOptimisticItemReadState(
  qc: QueryClient,
  ids: number[],
  targetUnread: boolean,
  prevFeeds: Feed[] | undefined,
  // The server's scope mark skips filtered rows; per-id marks do not.
  skipFiltered = false,
) {
  const idSet = new Set(ids);
  const feedDeltaMap = new Map<number, number>();
  const countedIds = new Set<number>();
  const updatedItemsById = new Map<number, Item>();

  // setQueryData marks a query fresh even for an unchanged result, which would
  // undo invalidations; write only the lists that really change.
  for (const [key, old] of qc.getQueriesData<ItemsInfiniteData>({
    queryKey: queryKeys.items.lists(),
  })) {
    if (!old) continue;
    let changed = false;
    const pages = old.pages.map((page) => {
      let pageChanged = false;
      const data = page.data.map((item) => {
        if (!idSet.has(item.id) || item.unread === targetUnread) {
          return item;
        }
        if (skipFiltered && item.filtered) return item;

        // Count each item once even when several cached lists hold it;
        // filtered rows are not in the counts.
        if (!item.filtered && !countedIds.has(item.id)) {
          countedIds.add(item.id);
          const delta = targetUnread ? 1 : -1;
          feedDeltaMap.set(
            item.feed_id,
            (feedDeltaMap.get(item.feed_id) ?? 0) + delta,
          );
        }

        const updatedItem = { ...item, unread: targetUnread };
        updatedItemsById.set(item.id, updatedItem);
        pageChanged = true;
        return updatedItem;
      });
      if (!pageChanged) return page;
      changed = true;
      return { ...page, data };
    });
    if (changed) qc.setQueryData<ItemsInfiniteData>(key, { ...old, pages });
  }

  for (const id of ids) {
    const detailKey = queryKeys.items.detail(id);
    const old = qc.getQueryData<Item>(detailKey);
    if (!old) {
      const optimisticItem = updatedItemsById.get(id);
      if (optimisticItem) qc.setQueryData<Item>(detailKey, optimisticItem);
    } else if (old.unread !== targetUnread && !(skipFiltered && old.filtered)) {
      qc.setQueryData<Item>(detailKey, { ...old, unread: targetUnread });
    }
  }

  if (prevFeeds && feedDeltaMap.size > 0) {
    qc.setQueryData(queryKeys.feeds.list(), (old: Feed[] | undefined) =>
      old?.map((feed) => {
        const delta = feedDeltaMap.get(feed.id) ?? 0;
        if (delta === 0) return feed;

        return {
          ...feed,
          unread_count: Math.max(0, feed.unread_count + delta),
        };
      }),
    );
  }

  // Mirror the read-state change into bookmark caches so the starred view (which
  // renders bookmarks as articles) reflects the toggle without a refetch.
  for (const [key, old] of qc.getQueriesData<BookmarksInfiniteData>({
    queryKey: queryKeys.bookmarks.lists(),
  })) {
    if (!old) continue;
    let changed = false;
    const pages = old.pages.map((page) => {
      let pageChanged = false;
      const newData = page.data.map((bookmark) => {
        if (
          bookmark.item_id != null &&
          idSet.has(bookmark.item_id) &&
          bookmark.unread !== targetUnread
        ) {
          pageChanged = true;
          return { ...bookmark, unread: targetUnread };
        }
        return bookmark;
      });
      if (!pageChanged) return page;
      changed = true;
      return { ...page, data: newData };
    });
    if (changed) qc.setQueryData<BookmarksInfiniteData>(key, { ...old, pages });
  }
}

// A next-page fetch builds its result from the pages it saw at start, so it
// would bring back the old unread flags. Flip the rows again once it lands.
// maxId also flips rows the page brings that were not loaded when the scope
// mark started: the server marked every id up to it.
function reapplyAfterNextPageLoads(
  qc: QueryClient,
  ids: number[],
  targetUnread: boolean,
  skipFiltered: boolean,
  context: ItemsMutationContext,
  maxId?: number,
) {
  const idSet = new Set(ids);
  const inFlight = qc.getQueryCache().findAll({
    queryKey: queryKeys.items.lists(),
    predicate: (query) =>
      query.state.fetchStatus === "fetching" && !!query.state.fetchMeta?.fetchMore,
  });
  for (const query of inFlight) {
    const reapply = () => {
      if (context.failed) return;
      qc.setQueryData<ItemsInfiniteData>(query.queryKey, (old) => {
        if (!old) return old;
        let changed = false;
        const pages = old.pages.map((page) => {
          let pageChanged = false;
          const data = page.data.map((item) => {
            if (
              !(
                idSet.has(item.id) ||
                (maxId !== undefined && item.id <= maxId)
              ) ||
              item.unread === targetUnread ||
              (skipFiltered && item.filtered)
            ) {
              return item;
            }
            pageChanged = true;
            return { ...item, unread: targetUnread };
          });
          if (!pageChanged) return page;
          changed = true;
          return { ...page, data };
        });
        return changed ? { ...old, pages } : old;
      });
    };
    void query.promise?.then(reapply, reapply);
  }
}

function rollbackItemsMutation(
  qc: QueryClient,
  context: ItemsMutationContext | undefined,
) {
  if (!context) return;

  // Restore only what the optimistic step replaced; setQueryData on an
  // untouched query would clear its invalidated flag.
  for (const [key, data] of context.prevItemLists) {
    if (qc.getQueryData(key) !== data) qc.setQueryData(key, data);
  }

  for (const [id, data] of context.prevItemDetails) {
    const key = queryKeys.items.detail(id);
    if (data === undefined) {
      // The optimistic step created this entry. Removing a watched entry does
      // not re-render its view, so flip the flag back there instead.
      const current = qc.getQueryData<Item>(key);
      if (!current) continue;
      const watched = qc
        .getQueryCache()
        .find({ queryKey: key, exact: true })
        ?.getObserversCount();
      if (watched) {
        qc.setQueryData<Item>(key, { ...current, unread: !current.unread });
      } else {
        qc.removeQueries({ queryKey: key, exact: true });
      }
    } else if (qc.getQueryData(key) !== data) {
      qc.setQueryData(key, data);
    }
  }

  if (
    context.prevFeeds &&
    qc.getQueryData(queryKeys.feeds.list()) !== context.prevFeeds
  ) {
    qc.setQueryData(queryKeys.feeds.list(), context.prevFeeds);
  }

  for (const [key, data] of context.prevBookmarkLists) {
    if (qc.getQueryData(key) !== data) qc.setQueryData(key, data);
  }
}

// Mark-unread only flips rows a list already holds; an unread-only list
// without the item must reload to show it. No refetch of the open list.
function invalidateUnreadListsLackingItems(qc: QueryClient, ids: number[]) {
  void qc.invalidateQueries({
    queryKey: queryKeys.items.lists(),
    refetchType: "none",
    predicate: (query) => {
      const filters = query.queryKey[2] as NormalizedItemFilters | undefined;
      if (!filters?.unread) return false;
      const data = query.state.data as ItemsInfiniteData | undefined;
      return !ids.every((id) =>
        data?.pages.some((page) => page.data.some((item) => item.id === id)),
      );
    },
  });
}

function useSetItemsReadState(targetUnread: boolean) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (ids: number[]) => {
      if (targetUnread) {
        await itemAPI.markUnread({ ids });
      } else {
        await itemAPI.markRead({ ids });
      }

      return ids;
    },
    onMutate: async (ids) => {
      await cancelOptimisticTargets(qc, ids);

      const context = snapshotItemsMutationState(qc, ids);
      applyOptimisticItemReadState(qc, ids, targetUnread, context.prevFeeds);
      reapplyAfterNextPageLoads(qc, ids, targetUnread, false, context);
      return context;
    },
    onError: (_error, _ids, context) => {
      if (context) context.failed = true;
      rollbackItemsMutation(qc, context);
    },
    // Not awaited: the mutation settles when the mark request does, and the
    // auto-mark-read hook retries while one is pending.
    onSettled: (_data, _error, ids) => {
      if (targetUnread) invalidateUnreadListsLackingItems(qc, ids);
      void qc.invalidateQueries({ queryKey: queryKeys.feeds.all });
    },
  });
}

export function useMarkItemsRead() {
  return useSetItemsReadState(false);
}

export function useMarkItemsUnread() {
  return useSetItemsReadState(true);
}

/**
 * Marks a whole feed, group or everything read on the server. Only the loaded
 * rows flip optimistically; caches holding the rest are marked stale.
 */
export function useMarkScopeRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: {
      request: MarkScopeReadRequest;
      loadedIds: number[];
    }) => {
      await itemAPI.markScopeRead(vars.request);
      // Later pages are not bounded by max_id; the scope mark skips those rows.
      const aboveSnapshot = vars.loadedIds.filter(
        (id) => id > vars.request.max_id,
      );
      if (aboveSnapshot.length > 0) {
        await itemAPI.markRead({ ids: aboveSnapshot });
      }
    },
    onMutate: async ({ request, loadedIds }) => {
      await cancelOptimisticTargets(qc, loadedIds);

      const context = snapshotItemsMutationState(qc, loadedIds);
      applyOptimisticItemReadState(qc, loadedIds, false, context.prevFeeds, true);
      reapplyAfterNextPageLoads(
        qc,
        loadedIds,
        false,
        true,
        context,
        request.max_id,
      );
      return context;
    },
    onError: (_error, _vars, context) => {
      if (context) context.failed = true;
      rollbackItemsMutation(qc, context);
    },
    // Not awaited, so the mutation settles when the mark request does.
    onSettled: () => {
      // No refetch of the open list: it would drop the rows pinned for undo.
      void qc.invalidateQueries({
        queryKey: queryKeys.items.all,
        refetchType: "none",
      });
      void qc.invalidateQueries({
        queryKey: queryKeys.bookmarks.all,
        refetchType: "none",
      });
      void qc.invalidateQueries({ queryKey: queryKeys.feeds.all });
    },
  });
}
