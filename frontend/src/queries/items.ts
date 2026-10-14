import {
  infiniteQueryOptions,
  queryOptions,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  hashKey,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  itemAPI,
  type Bookmark,
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
// What one mutation changed, so its rollback undoes only that against the
// current cache; a whole-cache snapshot would also undo an overlapping mutation.
type ItemsMutationContext = {
  targetUnread: boolean;
  // Ids flipped per cache, keyed by query hash.
  flippedLists: Map<string, Set<number>>;
  flippedBookmarkLists: Map<string, Set<number>>;
  flippedDetails: Set<number>;
  // Details that did not exist before the optimistic step.
  createdDetails: Set<number>;
  feedDeltas: Map<number, number>;
  // Set by onError so a late re-apply does not undo the rollback.
  failed: boolean;
  seq: number;
  // Rows registered in the per-row tracker below; released on settle.
  touched: Set<number>;
  settled: boolean;
  // Details still loading when the mark started: their response may predate it.
  loadingDetails: Set<number>;
  // Row id -> feed of each row counted in feedDeltas.
  countedRows: Map<number, number>;
};

// Per row: the marks still pending (seq -> target) and the value the server
// holds, so a failed mark reverts a row only if no newer mark touched it, and to
// the newest older pending target, else the confirmed value.
type RowMarks = {
  pending: Map<number, boolean>;
  confirmed: boolean;
  confirmedSeq: number;
};
const rowMarksByClient = new WeakMap<QueryClient, Map<number, RowMarks>>();
let markSeq = 0;

function rowMarks(qc: QueryClient) {
  let marks = rowMarksByClient.get(qc);
  if (!marks) {
    marks = new Map();
    rowMarksByClient.set(qc, marks);
  }
  return marks;
}

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

function createItemsMutationContext(targetUnread: boolean): ItemsMutationContext {
  return {
    targetUnread,
    flippedLists: new Map(),
    flippedBookmarkLists: new Map(),
    flippedDetails: new Set(),
    createdDetails: new Set(),
    feedDeltas: new Map(),
    failed: false,
    seq: ++markSeq,
    touched: new Set(),
    settled: false,
    loadingDetails: new Set(),
    countedRows: new Map(),
  };
}

// A row without an entry is tracked only if this mark flipped it; its server
// value is then the one the flip replaced.
function touchRow(
  qc: QueryClient,
  context: ItemsMutationContext,
  id: number,
  flipped: boolean,
) {
  if (context.settled || context.touched.has(id)) return;
  const marks = rowMarks(qc);
  let entry = marks.get(id);
  if (!entry) {
    if (!flipped) return;
    entry = {
      pending: new Map(),
      confirmed: !context.targetUnread,
      confirmedSeq: 0,
    };
    marks.set(id, entry);
  }
  entry.pending.set(context.seq, context.targetUnread);
  context.touched.add(id);
}

function flippedIds(context: ItemsMutationContext) {
  const ids = new Set([...context.flippedDetails, ...context.createdDetails]);
  for (const set of [
    ...context.flippedLists.values(),
    ...context.flippedBookmarkLists.values(),
  ]) {
    for (const id of set) ids.add(id);
  }
  return ids;
}

function trackRows(qc: QueryClient, context: ItemsMutationContext, ids: number[]) {
  const flipped = flippedIds(context);
  for (const id of ids) touchRow(qc, context, id, flipped.has(id));
}

// okUpTo: rows with an id up to it count as written even when ok is false.
function releaseRows(
  qc: QueryClient,
  context: ItemsMutationContext,
  ok: boolean,
  okUpTo = -Infinity,
) {
  context.settled = true;
  const marks = rowMarks(qc);
  for (const id of context.touched) {
    const entry = marks.get(id);
    if (!entry) continue;
    // The server holds the value of the newest successful mark.
    if ((ok || id <= okUpTo) && context.seq > entry.confirmedSeq) {
      entry.confirmed = context.targetUnread;
      entry.confirmedSeq = context.seq;
    }
    entry.pending.delete(context.seq);
    if (entry.pending.size === 0) marks.delete(id);
  }
}

// The value to restore a row to, or undefined to leave it to a newer mark.
function revertValue(qc: QueryClient, context: ItemsMutationContext, id: number) {
  const entry = rowMarks(qc).get(id);
  if (!entry || !context.touched.has(id)) return !context.targetUnread;
  if (entry.confirmedSeq > context.seq) return undefined;
  let to = entry.confirmed;
  let olderSeq = 0;
  for (const [seq, target] of entry.pending) {
    if (seq > context.seq) return undefined;
    if (seq < context.seq && seq > olderSeq) {
      olderSeq = seq;
      to = target;
    }
  }
  return to;
}

function loadingDetailIds(qc: QueryClient, ids: number[]) {
  const idSet = new Set(ids);
  return new Set(
    qc
      .getQueryCache()
      .findAll({
        queryKey: queryKeys.items.details(),
        predicate: (query) =>
          query.state.fetchStatus === "fetching" &&
          idSet.has(query.queryKey[2] as number),
      })
      .map((query) => query.queryKey[2] as number),
  );
}

// A detail GET sent before the mark can answer with the old state after it, and
// is not cancelled (rf-detail-cancel); refetch it once the mark has settled.
function refetchLoadingDetails(qc: QueryClient, context: ItemsMutationContext) {
  if (context.loadingDetails.size === 0) return;
  void qc.invalidateQueries({
    queryKey: queryKeys.items.details(),
    refetchType: "all",
    predicate: (query) => context.loadingDetails.has(query.queryKey[2] as number),
  });
}

// Cancels only what the optimistic update overwrites. Kept: a next-page load
// (appends, replaces nothing) and a list or detail without data (a cancel would
// leave it pending and idle, never refetched).
function cancelOptimisticTargets(qc: QueryClient, ids: number[]) {
  const idSet = new Set(ids);
  return Promise.all([
    qc.cancelQueries({
      queryKey: queryKeys.items.lists(),
      predicate: (query) =>
        !query.state.fetchMeta?.fetchMore && query.state.data !== undefined,
    }),
    qc.cancelQueries({
      queryKey: queryKeys.items.details(),
      predicate: (query) =>
        idSet.has(query.queryKey[2] as number) && query.state.data !== undefined,
    }),
    qc.cancelQueries({ queryKey: queryKeys.feeds.all }),
  ]);
}

function applyOptimisticItemReadState(
  qc: QueryClient,
  ids: number[],
  context: ItemsMutationContext,
  // The server's scope mark skips filtered rows; per-id marks do not.
  skipFiltered = false,
) {
  const { targetUnread, feedDeltas: feedDeltaMap } = context;
  const idSet = new Set(ids);
  const updatedItemsById = new Map<number, Item>();

  // setQueryData marks a query fresh even for an unchanged result, which would
  // undo invalidations; write only the lists that really change.
  for (const [key, old] of qc.getQueriesData<ItemsInfiniteData>({
    queryKey: queryKeys.items.lists(),
  })) {
    if (!old) continue;
    let changed = false;
    const flipped = new Set<number>();
    const pages = old.pages.map((page) => {
      let pageChanged = false;
      const data = page.data.map((item) => {
        if (!idSet.has(item.id) || item.unread === targetUnread) {
          return item;
        }
        if (skipFiltered && item.filtered) return item;

        // Count each item once even when several cached lists hold it;
        // filtered rows are not in the counts.
        if (!item.filtered && !context.countedRows.has(item.id)) {
          context.countedRows.set(item.id, item.feed_id);
          const delta = targetUnread ? 1 : -1;
          feedDeltaMap.set(
            item.feed_id,
            (feedDeltaMap.get(item.feed_id) ?? 0) + delta,
          );
        }

        const updatedItem = { ...item, unread: targetUnread };
        updatedItemsById.set(item.id, updatedItem);
        flipped.add(item.id);
        pageChanged = true;
        return updatedItem;
      });
      if (!pageChanged) return page;
      changed = true;
      return { ...page, data };
    });
    if (changed) {
      context.flippedLists.set(hashKey(key), flipped);
      qc.setQueryData<ItemsInfiniteData>(key, { ...old, pages });
    }
  }

  for (const id of ids) {
    const detailKey = queryKeys.items.detail(id);
    const old = qc.getQueryData<Item>(detailKey);
    if (!old) {
      const optimisticItem = updatedItemsById.get(id);
      if (optimisticItem) {
        context.createdDetails.add(id);
        qc.setQueryData<Item>(detailKey, optimisticItem);
      }
    } else if (old.unread !== targetUnread && !(skipFiltered && old.filtered)) {
      context.flippedDetails.add(id);
      qc.setQueryData<Item>(detailKey, { ...old, unread: targetUnread });
    }
  }

  if (feedDeltaMap.size > 0 && qc.getQueryData(queryKeys.feeds.list())) {
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
    const flipped = new Set<number>();
    const pages = old.pages.map((page) => {
      let pageChanged = false;
      const newData = page.data.map((bookmark) => {
        if (
          bookmark.item_id != null &&
          idSet.has(bookmark.item_id) &&
          bookmark.unread !== targetUnread
        ) {
          flipped.add(bookmark.item_id);
          pageChanged = true;
          return { ...bookmark, unread: targetUnread };
        }
        return bookmark;
      });
      if (!pageChanged) return page;
      changed = true;
      return { ...page, data: newData };
    });
    if (changed) {
      context.flippedBookmarkLists.set(hashKey(key), flipped);
      qc.setQueryData<BookmarksInfiniteData>(key, { ...old, pages });
    }
  }
}

// A next-page fetch builds its result from the pages it saw at start, so it
// would bring back the old unread flags. Flip the rows again once it lands.
// maxId also flips rows the page brings that were not loaded when the scope
// mark started: the server marked every id up to it, within inScope.
function reapplyAfterNextPageLoads(
  qc: QueryClient,
  ids: number[],
  targetUnread: boolean,
  skipFiltered: boolean,
  context: ItemsMutationContext,
  maxId?: number,
  inScope: (item: Item) => boolean = () => true,
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
      const flipped = new Set<number>();
      qc.setQueryData<ItemsInfiniteData>(query.queryKey, (old) => {
        if (!old) return old;
        let changed = false;
        const pages = old.pages.map((page) => {
          let pageChanged = false;
          const data = page.data.map((item) => {
            if (
              !(
                idSet.has(item.id) ||
                (maxId !== undefined && item.id <= maxId && inScope(item))
              ) ||
              item.unread === targetUnread ||
              (skipFiltered && item.filtered)
            ) {
              return item;
            }
            flipped.add(item.id);
            pageChanged = true;
            return { ...item, unread: targetUnread };
          });
          if (!pageChanged) return page;
          changed = true;
          return { ...page, data };
        });
        return changed ? { ...old, pages } : old;
      });
      // Rows flipped here are this mutation's too: a rollback must undo them.
      if (flipped.size === 0) return;
      const hash = hashKey(query.queryKey);
      const known = context.flippedLists.get(hash) ?? new Set<number>();
      for (const id of flipped) known.add(id);
      context.flippedLists.set(hash, known);
      for (const id of flipped) touchRow(qc, context, id, true);
    };
    void query.promise?.then(reapply, reapply);
  }
}

// Reverts only the listed rows that still hold this mutation's value; rows
// another mutation changed since, or that were never flipped, stay as they are.
function unflipRows<
  R extends { unread: boolean },
  D extends { pages: Array<{ data: R[] }> },
>(
  old: D,
  ids: Set<number>,
  targetUnread: boolean,
  idOf: (row: R) => number | null,
  revertTo: (id: number) => boolean | undefined,
): D | undefined {
  let changed = false;
  const pages = old.pages.map((page) => {
    let pageChanged = false;
    const data = page.data.map((row) => {
      const id = idOf(row);
      if (id === null || !ids.has(id) || row.unread !== targetUnread) return row;
      const to = revertTo(id);
      if (to === undefined || to === targetUnread) return row;
      pageChanged = true;
      return { ...row, unread: to };
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, data };
  });
  return changed ? { ...old, pages } : undefined;
}

// keep: rows to leave as they are (the server holds this mutation's value).
function rollbackItemsMutation(
  qc: QueryClient,
  context: ItemsMutationContext | undefined,
  keep?: (id: number) => boolean,
) {
  if (!context) return;
  const { targetUnread } = context;
  const revertTo = (id: number) =>
    keep?.(id) ? undefined : revertValue(qc, context, id);

  // Write only the caches that really change; setQueryData on an untouched
  // query would clear its invalidated flag.
  for (const [key, old] of qc.getQueriesData<ItemsInfiniteData>({
    queryKey: queryKeys.items.lists(),
  })) {
    const ids = context.flippedLists.get(hashKey(key));
    if (!old || !ids) continue;
    const next = unflipRows<Item, ItemsInfiniteData>(
      old,
      ids,
      targetUnread,
      (item) => item.id,
      revertTo,
    );
    if (next) qc.setQueryData<ItemsInfiniteData>(key, next);
  }

  for (const id of context.flippedDetails) {
    const key = queryKeys.items.detail(id);
    const current = qc.getQueryData<Item>(key);
    const to = revertTo(id);
    if (current?.unread === targetUnread && to !== undefined && to !== targetUnread) {
      qc.setQueryData<Item>(key, { ...current, unread: to });
    }
  }

  for (const id of context.createdDetails) {
    const key = queryKeys.items.detail(id);
    const current = qc.getQueryData<Item>(key);
    const to = revertTo(id);
    if (!current || to === undefined) continue;
    // Removing a watched entry does not re-render its view, so flip the flag
    // back there instead.
    const watched = qc
      .getQueryCache()
      .find({ queryKey: key, exact: true })
      ?.getObserversCount();
    if (!watched) {
      qc.removeQueries({ queryKey: key, exact: true });
    } else if (current.unread === targetUnread && to !== targetUnread) {
      qc.setQueryData<Item>(key, { ...current, unread: to });
    }
  }

  const feedDeltas = new Map(context.feedDeltas);
  if (keep) {
    for (const [id, feedId] of context.countedRows) {
      if (keep(id)) {
        feedDeltas.set(feedId, (feedDeltas.get(feedId) ?? 0) - (targetUnread ? 1 : -1));
      }
    }
  }
  if (feedDeltas.size > 0 && qc.getQueryData(queryKeys.feeds.list())) {
    qc.setQueryData(queryKeys.feeds.list(), (old: Feed[] | undefined) =>
      old?.map((feed) => {
        const delta = feedDeltas.get(feed.id) ?? 0;
        if (delta === 0) return feed;
        return { ...feed, unread_count: Math.max(0, feed.unread_count - delta) };
      }),
    );
  }

  for (const [key, old] of qc.getQueriesData<BookmarksInfiniteData>({
    queryKey: queryKeys.bookmarks.lists(),
  })) {
    const ids = context.flippedBookmarkLists.get(hashKey(key));
    if (!old || !ids) continue;
    const next = unflipRows<Bookmark, BookmarksInfiniteData>(
      old,
      ids,
      targetUnread,
      (bookmark) => bookmark.item_id,
      revertTo,
    );
    if (next) qc.setQueryData<BookmarksInfiniteData>(key, next);
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

      const context = createItemsMutationContext(targetUnread);
      context.loadingDetails = loadingDetailIds(qc, ids);
      applyOptimisticItemReadState(qc, ids, context);
      trackRows(qc, context, ids);
      reapplyAfterNextPageLoads(qc, ids, targetUnread, false, context);
      return context;
    },
    onError: (_error, _ids, context) => {
      if (context) context.failed = true;
      rollbackItemsMutation(qc, context);
    },
    // Not awaited: the mutation settles when the mark request does, and the
    // auto-mark-read hook retries while one is pending.
    onSettled: (_data, error, ids, context) => {
      if (context) {
        releaseRows(qc, context, !error);
        refetchLoadingDetails(qc, context);
      }
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

function loadedFilteredIds(qc: QueryClient) {
  const ids = new Set<number>();
  for (const [, data] of qc.getQueriesData<ItemsInfiniteData>({
    queryKey: queryKeys.items.lists(),
  })) {
    for (const page of data?.pages ?? []) {
      for (const item of page.data) if (item.filtered) ids.add(item.id);
    }
  }
  return ids;
}

/** Unread ids of the given feeds held in any loaded item list, for scope marks. */
export function loadedUnreadIdsForFeeds(qc: QueryClient, feedIds: number[]) {
  const feeds = new Set(feedIds);
  const ids = new Set<number>();
  for (const [, data] of qc.getQueriesData<ItemsInfiniteData>({
    queryKey: queryKeys.items.lists(),
  })) {
    for (const page of data?.pages ?? []) {
      for (const item of page.data) {
        if (feeds.has(item.feed_id) && item.unread && item.id > 0) {
          ids.add(item.id);
        }
      }
    }
  }
  return [...ids];
}

// Scope marks whose PATCH went through; if the by-id follow-up then fails, the
// rows up to max_id stay read. A set keeps the original error for the toast.
const scopeApplied = new WeakSet<object>();

// Whether a row falls inside a scope mark's feed or group. A group is resolved
// through the cached feed list; without it no row is known to be inside.
function scopeMatcher(qc: QueryClient, request: MarkScopeReadRequest) {
  const { feed_id: feedId, group_id: groupId } = request;
  if (feedId !== undefined) return (item: Item) => item.feed_id === feedId;
  if (groupId === undefined) return () => true;
  const feedIds = new Set(
    (qc.getQueryData<Feed[]>(queryKeys.feeds.list()) ?? [])
      .filter((feed) => feed.group_id === groupId)
      .map((feed) => feed.id),
  );
  return (item: Item) => feedIds.has(item.feed_id);
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
      scopeApplied.add(vars);
      // Later pages are not bounded by max_id; the scope mark skips those rows.
      // A by-id mark would also change filtered rows, which the scope mark
      // never touches, so they are left out.
      const filteredIds = loadedFilteredIds(qc);
      const aboveSnapshot = vars.loadedIds.filter(
        (id) => id > vars.request.max_id && !filteredIds.has(id),
      );
      if (aboveSnapshot.length > 0) {
        await itemAPI.markRead({ ids: aboveSnapshot });
      }
    },
    onMutate: async ({ request, loadedIds }) => {
      await cancelOptimisticTargets(qc, loadedIds);

      const context = createItemsMutationContext(false);
      context.loadingDetails = loadingDetailIds(qc, loadedIds);
      applyOptimisticItemReadState(qc, loadedIds, context, true);
      // The scope mark never touches filtered rows.
      const filtered = loadedFilteredIds(qc);
      trackRows(
        qc,
        context,
        loadedIds.filter((id) => !filtered.has(id)),
      );
      reapplyAfterNextPageLoads(
        qc,
        loadedIds,
        false,
        true,
        context,
        request.max_id,
        scopeMatcher(qc, request),
      );
      return context;
    },
    onError: (_error, vars, context) => {
      if (context) context.failed = true;
      const maxId = vars.request.max_id;
      rollbackItemsMutation(
        qc,
        context,
        scopeApplied.has(vars) ? (id) => id <= maxId : undefined,
      );
    },
    // Not awaited, so the mutation settles when the mark request does.
    onSettled: (_data, error, vars, context) => {
      if (context) {
        releaseRows(
          qc,
          context,
          !error,
          scopeApplied.has(vars) ? vars.request.max_id : undefined,
        );
        refetchLoadingDetails(qc, context);
      }
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
