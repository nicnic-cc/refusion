import { useCallback, useMemo } from "react";
import { useItems } from "@/queries/items";
import { useIncludeFiltered } from "@/hooks/use-show-filtered";
import {
  indexBookmarks,
  useBookmarkLookup,
  useStarredItems,
} from "@/queries/bookmarks";
import { useArticlePinsStore, articleListKey } from "@/store";
import type { Bookmark, Item } from "@/lib/api";
import type { ArticleFilter } from "@/lib/article-filter";

interface ArticleListFilters {
  feedId: number | null;
  groupId: number | null;
  articleFilter: ArticleFilter;
}

export function useArticleList(filters: ArticleListFilters) {
  const isStarredMode = filters.articleFilter === "starred";
  const isUnreadMode = filters.articleFilter === "unread";

  const includeFiltered = useIncludeFiltered(filters.feedId);

  // Items are unused in starred mode (bookmarks ARE the articles there), so
  // skip the request entirely.
  const itemsQuery = useItems(
    {
      feedId: filters.feedId,
      groupId: filters.groupId,
      unread: isUnreadMode ? true : undefined,
      includeFiltered,
    },
    !isStarredMode,
  );

  // Unfiltered lookup: powers star indicators in non-starred views.
  const lookup = useBookmarkLookup();

  // Server-filtered, paginated starred list. Only fetched in starred mode.
  const starred = useStarredItems(
    { feedId: filters.feedId, groupId: filters.groupId },
    isStarredMode,
  );

  // Pinned ids for this exact list keep just-marked-read rows visible in the
  // unread view so the marking can be undone in place (see article-pins.ts).
  const pinsKey = articleListKey(
    filters.feedId,
    filters.groupId,
    filters.articleFilter,
  );
  const pinnedIds = useArticlePinsStore((s) => s.pins[pinsKey]);

  const items = useMemo(
    () => itemsQuery.data?.pages.flatMap((p) => p.data) ?? [],
    [itemsQuery.data],
  );

  const visibleItems = useMemo(() => {
    if (!isUnreadMode) return items;

    // The unread view always shows exactly `unread || pinned`: with no pins
    // left (none written yet, or cleared on leaving the list) rows already
    // marked read must drop out of the cache-driven display.
    return items.filter(
      (item) => item.unread || (pinnedIds?.has(item.id) ?? false),
    );
  }, [items, isUnreadMode, pinnedIds]);

  const articles: Item[] = isStarredMode ? starred.items : visibleItems;

  // Shared by the list and the drawer so a selection change looks up one id
  // instead of scanning (or re-mapping) every loaded row.
  const articleIds = useMemo(() => articles.map((a) => a.id), [articles]);
  const indexById = useMemo(
    () => new Map(articleIds.map((id, index) => [id, index])),
    [articleIds],
  );

  // Bookmark resolution for star state + un-starring. In starred mode every
  // displayed article is itself a bookmark, so resolve from the starred data
  // (which may exceed the lookup's first page). Otherwise use the lookup.
  const bookmarkSource: Bookmark[] = isStarredMode
    ? starred.bookmarks
    : lookup.bookmarks;
  const findBookmark = useMemo(
    () => indexBookmarks(bookmarkSource),
    [bookmarkSource],
  );

  const isItemStarred = useCallback(
    (itemId: number, link?: string) =>
      isStarredMode ? true : findBookmark(itemId, link) !== undefined,
    [isStarredMode, findBookmark],
  );

  const getBookmarkByItemId = findBookmark;

  return {
    articles,
    articleIds,
    indexById,
    hasMore: isStarredMode ? starred.hasNextPage : itemsQuery.hasNextPage,
    isLoading: isStarredMode ? starred.isLoading : itemsQuery.isLoading,
    isLoadingMore: isStarredMode
      ? starred.isFetchingNextPage
      : itemsQuery.isFetchingNextPage,
    isFetchNextPageError: isStarredMode
      ? starred.isFetchNextPageError
      : itemsQuery.isFetchNextPageError,
    isStarredMode,
    fetchNextPage: isStarredMode
      ? starred.fetchNextPage
      : () => void itemsQuery.fetchNextPage(),
    isItemStarred,
    getBookmarkByItemId,
  };
}
