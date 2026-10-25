import { useCallback, useEffect, useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  bookmarkAPI,
  type Bookmark,
  type Item,
  type PaginatedListResponse,
} from "@/lib/api";
import {
  normalizeBookmarkFilters,
  queryKeys,
  type BookmarkFilters,
  type NormalizedBookmarkFilters,
} from "./keys";
import { usePreferencesStore } from "@/store";

// The lookup query (star icons + sidebar count) pages through every bookmark;
// 100 is the backend per-request cap, so it is the natural chunk size.
const BOOKMARK_LOOKUP_PAGE_SIZE = 100;

type BookmarkListResponse = PaginatedListResponse<Bookmark>;
export type BookmarksInfiniteData = InfiniteData<BookmarkListResponse, string | null>;

export function resolveBookmarkItemId(bookmark: Bookmark): number {
  return bookmark.item_id ?? -bookmark.id;
}

// Finds the bookmark of an item by id or, failing that, by link: bookmarks.link
// is UNIQUE, so a cross-posted article (same link, other item id) is starred
// through the one bookmark that exists.
export function indexBookmarks(bookmarks: Bookmark[]) {
  const byItemId = new Map<number, Bookmark>();
  const byLink = new Map<string, Bookmark>();
  for (const b of bookmarks) {
    byItemId.set(resolveBookmarkItemId(b), b);
    if (b.link) byLink.set(b.link, b);
  }
  return (itemId: number, link?: string): Bookmark | undefined =>
    byItemId.get(itemId) ?? (link ? byLink.get(link) : undefined);
}

function buildListBookmarksParams(
  filters: NormalizedBookmarkFilters,
  cursor: string | null,
  pageSize: number,
) {
  const params: Parameters<typeof bookmarkAPI.list>[0] = {
    limit: pageSize,
  };
  if (filters.feedId) params.feed_id = filters.feedId;
  if (filters.groupId) params.group_id = filters.groupId;
  if (cursor) params.before = cursor;
  return params;
}

// useBookmarks is the shared infinite query over bookmarks. Callers pass the
// filters and page size that fit their use case (lookup vs. starred list).
function useBookmarks(
  filters: BookmarkFilters,
  pageSize: number,
  enabled = true,
) {
  const normalized = normalizeBookmarkFilters(filters);
  return useInfiniteQuery({
    queryKey: [...queryKeys.bookmarks.lists(), normalized, pageSize],
    queryFn: async ({ pageParam }) =>
      bookmarkAPI.list(
        buildListBookmarksParams(normalized, pageParam, pageSize),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    staleTime: Number.POSITIVE_INFINITY,
    enabled,
  });
}

// useBookmarkLookup powers star icons and the sidebar starred count. Unfiltered
// so star state matches across views; it loads every page, or an older bookmark
// would look unstarred and starring it again would hit the UNIQUE link constraint.
export function useBookmarkLookup() {
  const query = useBookmarks({}, BOOKMARK_LOOKUP_PAGE_SIZE);
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } =
    query;

  // Stop after a failed page fetch so a persistent error can't loop. Two
  // components mount this hook; cancelRefetch: false keeps them from restarting
  // each other's in-flight page.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
      void fetchNextPage({ cancelRefetch: false });
    }
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const bookmarks = useMemo(
    () => query.data?.pages.flatMap((p) => p.data) ?? [],
    [query.data],
  );
  const total = query.data?.pages.at(-1)?.total ?? 0;

  const findBookmark = useMemo(() => indexBookmarks(bookmarks), [bookmarks]);

  const isItemStarred = useCallback(
    (itemId: number, link?: string) =>
      findBookmark(itemId, link) !== undefined,
    [findBookmark],
  );

  const getBookmarkByItemId = findBookmark;

  return { bookmarks, total, isItemStarred, getBookmarkByItemId };
}

export interface StarredItemsResult {
  items: Item[];
  bookmarks: Bookmark[];
  hasNextPage: boolean;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => void;
}

// useStarredItems is the paginated, server-filtered starred list. Filtering by
// feed/group is pushed to the backend, so pagination is correct in every scope.
export function useStarredItems(
  filters: BookmarkFilters,
  enabled = true,
): StarredItemsResult {
  const pageSize = usePreferencesStore((state) => state.articlePageSize);
  const query = useBookmarks(filters, pageSize, enabled);

  const bookmarks = useMemo(
    () => query.data?.pages.flatMap((p) => p.data) ?? [],
    [query.data],
  );

  const items = useMemo<Item[]>(
    () =>
      bookmarks.map((bookmark) => ({
        id: bookmark.item_id ?? -bookmark.id,
        feed_id: bookmark.feed_id ?? 0,
        guid: bookmark.link || `bookmark:${bookmark.id}`,
        title: bookmark.title,
        link: bookmark.link,
        permalink: bookmark.permalink,
        content: bookmark.content,
        pub_date: bookmark.pub_date,
        unread: bookmark.unread,
        filtered: false,
        filtered_group: false,
        filtered_global: false,
        created_at: bookmark.created_at,
      })),
    [bookmarks],
  );

  return {
    items,
    bookmarks,
    hasNextPage: query.hasNextPage,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    isFetchNextPageError: query.isFetchNextPageError,
    fetchNextPage: () => void query.fetchNextPage({ cancelRefetch: false }),
  };
}

export function useCreateBookmark() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (item: Item) => {
      // item_id mode: the backend snapshots link/title/content/feed_name
      // from the item itself, which is always fresher than client copies.
      const res = await bookmarkAPI.create({ item_id: item.id });
      return res.data!;
    },
    onSuccess: (bookmark) => {
      const itemId = resolveBookmarkItemId(bookmark);
      // Optimistically insert/update across ALL bookmark list caches (including
      // feed/group-filtered variants). This may add the bookmark to a filtered
      // cache it doesn't belong in; onSettled below invalidates and reconciles.
      qc.setQueriesData<BookmarksInfiniteData>(
        { queryKey: queryKeys.bookmarks.lists() },
        (old) => {
          if (!old) return old;
          const pages = [...old.pages];
          const first = pages[0];
          if (!first) return old;

          const index = first.data.findIndex(
            (b) => resolveBookmarkItemId(b) === itemId,
          );
          if (index !== -1) {
            const newData = [...first.data];
            newData[index] = bookmark;
            pages[0] = { ...first, data: newData };
          } else {
            pages[0] = {
              ...first,
              data: [bookmark, ...first.data],
              total: first.total + 1,
            };
          }
          return { ...old, pages };
        },
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookmarks.all });
    },
  });
}

export function useDeleteBookmark() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (bookmarkId: number) => {
      await bookmarkAPI.delete(bookmarkId);
      return bookmarkId;
    },
    onSuccess: (bookmarkId) => {
      // Optimistically remove from every bookmark list cache (filtered or not);
      // onSettled below re-fetches to correct any cross-filter drift.
      qc.setQueriesData<BookmarksInfiniteData>(
        { queryKey: queryKeys.bookmarks.lists() },
        (old) => {
          if (!old) return old;
          const pages = old.pages.map((page) => {
            const newData = page.data.filter((b) => b.id !== bookmarkId);
            if (newData.length === page.data.length) return page;
            return {
              ...page,
              data: newData,
              total: Math.max(0, page.total - 1),
            };
          });
          return { ...old, pages };
        },
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookmarks.all });
    },
  });
}
