import {
  memo,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { CheckCheck, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TooltipButton } from "@/components/common/tooltip-button";
import { ArticleRow } from "./article-item";
import { ShowFilteredToggle } from "./show-filtered-toggle";
import { ArticleListFooter } from "./article-list-footer";
import { ScrollBox } from "@/components/scroll-box";
import { ContentHeader } from "@/components/layout/content-header";
import { SidebarTrigger } from "@/components/layout/sidebar-trigger";
import {
  onArticleNavigationEnd,
  onOpenArticleMissing,
  useArticleNavigation,
} from "@/hooks/use-keyboard";
import { useUrlState } from "@/hooks/use-url-state";
import { useArticleList } from "@/hooks/use-article-list";
import { useListPull } from "@/hooks/use-list-pull";
import { useMarkAllReadShortcut } from "@/hooks/use-mark-all-read-shortcut";
import { useNewArticles } from "@/hooks/use-new-articles";
import { NewArticlesPill } from "./new-articles-pill";
import { FeedErrorLine } from "./feed-error-line";
import { PullIndicator } from "@/components/feed/pull-indicator";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { usePreferencesStore } from "@/store/preferences";
import {
  useMarkItemsRead,
  useMarkItemsUnread,
  useMarkScopeRead,
} from "@/queries/items";
import { useFeedLookup } from "@/queries/feeds";
import { useGroups } from "@/queries/groups";
import { useCreateBookmark, useDeleteBookmark } from "@/queries/bookmarks";
import { getFaviconUrl } from "@/lib/api/favicon";
import { useI18n } from "@/lib/i18n";
import { allFeedsLabelKey } from "@/lib/all-feeds-label";
import {
  articleListKey,
  useArticlePinsStore,
  useReadStatePins,
  useUIStore,
} from "@/store";
import { apiErrorMessage, type Bookmark, type Item } from "@/lib/api";

const SCROLL_LOOKAHEAD_VIEWPORTS = 2;
const MAX_REOPEN_PAGES = 20;

interface FeedDisplay {
  name: string;
  faviconUrl: string;
  openPermalink: boolean;
}

interface ArticleRowsProps {
  articles: Item[];
  feedDisplay: Map<number, FeedDisplay>;
  unknownFeedName: string;
  freshAfter: number | null;
  isItemStarred: (itemId: number, link?: string) => boolean;
  getBookmarkByItemId: (
    itemId: number,
    link?: string,
  ) => Bookmark | undefined;
  onSelectArticle: (articleId: number | null) => void;
  onToggleRead: (article: Item) => Promise<void>;
  onToggleStar: (article: Item) => Promise<void>;
}

// Takes no selection prop, so a j press (selection only) skips every row here;
// each row follows its own selection.
const ArticleRows = memo(function ArticleRows({
  articles,
  feedDisplay,
  unknownFeedName,
  freshAfter,
  isItemStarred,
  getBookmarkByItemId,
  onSelectArticle,
  onToggleRead,
  onToggleStar,
}: ArticleRowsProps) {
  return articles.map((article) => {
    const feed = feedDisplay.get(article.feed_id);

    return (
      <ArticleRow
        key={article.id}
        article={article}
        onSelectArticle={onSelectArticle}
        onToggleRead={onToggleRead}
        onToggleStar={onToggleStar}
        canToggleRead={article.id > 0}
        isFresh={freshAfter !== null && article.id > freshAfter}
        isStarred={isItemStarred(article.id, article.link)}
        feedName={
          feed?.name ??
          getBookmarkByItemId(article.id, article.link)?.feed_name ??
          unknownFeedName
        }
        feedFaviconUrl={feed?.faviconUrl ?? null}
        openPermalink={feed?.openPermalink ?? false}
      />
    );
  });
});

export function ArticleList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const {
    articleFilter,
    selectedFeedId,
    selectedGroupId,
    selectedArticleId,
    setSelectedArticle,
  } = useUrlState();

  const {
    articles,
    articleIds,
    indexById,
    hasMore,
    isLoading,
    isLoadingMore,
    isFetchNextPageError,
    fetchNextPage,
    isItemStarred,
    getBookmarkByItemId,
  } = useArticleList({
    feedId: selectedFeedId,
    groupId: selectedGroupId,
    articleFilter,
  });

  const { data: groups = [] } = useGroups();
  const { feeds, getFeedById, isLoading: isFeedsLoading } = useFeedLookup();
  const setEditFeedOpen = useUIStore((s) => s.setEditFeedOpen);
  const markItemsRead = useMarkItemsRead();
  const markItemsUnread = useMarkItemsUnread();
  const markScopeRead = useMarkScopeRead();
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();

  const { pinRead, unpinRead } = useReadStatePins({
    feedId: selectedFeedId,
    groupId: selectedGroupId,
    articleFilter,
  });

  const pinsKey = articleListKey(selectedFeedId, selectedGroupId, articleFilter);
  const clearPins = useArticlePinsStore((s) => s.clearPins);

  // Leaving this exact list (filter/feed/group change or unmount) commits the
  // read markings: pinned rows stop being shown in the unread view. Only the
  // list itself clears pins — the drawer stays mounted on other pages and must
  // not commit on its own lifecycle.
  useEffect(() => {
    return () => {
      clearPins(pinsKey);
    };
  }, [pinsKey, clearPins]);

  useArticleNavigation(articleIds, {
    enabled: selectedArticleId === null,
  });

  // When every loaded row has been read away (hidden from the unread view),
  // keep pulling deeper pages instead of dead-ending on an empty list while
  // the server still has unread items. A failed fetch stops it (no retry loop).
  useEffect(() => {
    if (isLoading || isLoadingMore || isFetchNextPageError) return;
    if (articles.length === 0 && hasMore) {
      fetchNextPage();
    }
  }, [
    articles.length,
    hasMore,
    isLoading,
    isLoadingMore,
    isFetchNextPageError,
    fetchNextPage,
  ]);

  const articleLoading = usePreferencesStore((s) => s.articleLoading);
  const articlePageSize = usePreferencesStore((s) => s.articlePageSize);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The layout stays mounted across pages, so the scroll box is reused: start
  // each new list at the top, before paint, instead of at the old offset.
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pinsKey]);

  // Scrolling only loads in scroll mode; a key press counts as asking, like the button.
  const requestNextPage = useEffectEvent((asked = false) => {
    if (articleLoading !== "scroll" && !asked) return;
    if (isLoading || isLoadingMore || isFetchNextPageError || !hasMore) return;
    fetchNextPage();
  });

  // Look ahead by whole viewports: a page requested at 70px from the end
  // arrives after the user has already hit it.
  const loadMoreIfNearBottom = useEffectEvent(() => {
    const el = scrollRef.current;
    if (!el || el.scrollHeight === 0 || articles.length === 0) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < SCROLL_LOOKAHEAD_VIEWPORTS * el.clientHeight) {
      requestNextPage();
    }
  });

  // j on the last loaded row waits for the next page, then steps onto its first
  // article. One pending step; it is dropped when the selection or list moves on.
  const pendingAdvanceRef = useRef<number | null>(null);
  const advanceAfterLoad = useEffectEvent((lastId: number) => {
    if (!hasMore) return;
    pendingAdvanceRef.current = lastId;
    requestNextPage(true);
  });
  useEffect(
    () => onArticleNavigationEnd((lastId) => advanceAfterLoad(lastId)),
    [],
  );
  useEffect(() => {
    const pending = pendingAdvanceRef.current;
    if (pending === null) return;
    const index = indexById.get(pending) ?? -1;
    const isLast = index === articles.length - 1;
    if (
      selectedArticleId !== pending ||
      index === -1 ||
      isFetchNextPageError ||
      (isLast && !hasMore)
    ) {
      pendingAdvanceRef.current = null;
    } else if (!isLast) {
      pendingAdvanceRef.current = null;
      setSelectedArticle(articles[index + 1].id);
    }
  }, [
    articles,
    indexById,
    selectedArticleId,
    hasMore,
    isFetchNextPageError,
    setSelectedArticle,
  ]);

  // j with the open article gone from the loaded rows (the list reset to page 1):
  // page in until it returns and step past it, else give up on the first row.
  // Unread searches only for an article last seen unread; a read one is gone.
  const lastOpenRef = useRef<{ id: number; unread: boolean } | null>(null);
  useEffect(() => {
    if (selectedArticleId === null) return;
    const index = indexById.get(selectedArticleId);
    if (index === undefined) return;
    lastOpenRef.current = {
      id: selectedArticleId,
      unread: articles[index].unread,
    };
  }, [articles, indexById, selectedArticleId]);
  const searchRef = useRef<{
    id: number;
    listKey: string;
    pages: number;
    requestedAt: number;
  } | null>(null);
  const claimMissingArticle = useEffectEvent((id: number) => {
    // After a failed page nothing re-runs the search effect: take the first row.
    if (!hasMore || isFetchNextPageError) return false;
    if (articleFilter === "starred") return false;
    if (articleFilter === "unread") {
      const last = lastOpenRef.current;
      if (last?.id !== id || !last.unread) return false;
    }
    if (searchRef.current?.id === id && searchRef.current.listKey === pinsKey) {
      return true;
    }
    searchRef.current = {
      id,
      listKey: pinsKey,
      pages: 1,
      requestedAt: articles.length,
    };
    requestNextPage(true);
    return true;
  });
  useEffect(() => onOpenArticleMissing((id) => claimMissingArticle(id)), []);
  useEffect(() => {
    const search = searchRef.current;
    if (search === null) return;
    if (selectedArticleId !== search.id || pinsKey !== search.listKey) {
      searchRef.current = null;
      return;
    }
    const index = indexById.get(search.id);
    if (index !== undefined) {
      searchRef.current = null;
      if (index < articles.length - 1) setSelectedArticle(articles[index + 1].id);
      else advanceAfterLoad(search.id);
    } else if (isFetchNextPageError || !hasMore) {
      searchRef.current = null;
      if (articles.length > 0) setSelectedArticle(articles[0].id);
    } else if (articles.length !== search.requestedAt) {
      if (search.pages >= MAX_REOPEN_PAGES) {
        searchRef.current = null;
        if (articles.length > 0) setSelectedArticle(articles[0].id);
        return;
      }
      search.pages++;
      search.requestedAt = articles.length;
      requestNextPage(true);
    }
  }, [
    articles,
    indexById,
    selectedArticleId,
    pinsKey,
    hasMore,
    isFetchNextPageError,
    setSelectedArticle,
  ]);

  const selectedIndex =
    selectedArticleId === null ? -1 : (indexById.get(selectedArticleId) ?? -1);
  // One page ahead, so key repeat never waits on a fetch.
  const selectionNearEnd =
    selectedIndex >= 0 && selectedIndex >= articles.length - articlePageSize;

  // With the last loaded row selected, show the footer too: the spinner while the
  // page loads, the button in button mode, and the new rows land in place.
  const footerRef = useRef<HTMLDivElement>(null);
  const lastRowSelectedWithMore =
    hasMore && selectedIndex >= 0 && selectedIndex === articles.length - 1;
  useEffect(() => {
    if (lastRowSelectedWithMore) {
      footerRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [lastRowSelectedWithMore, selectedArticleId]);

  // Wait until scrolling stops, so a page never lands mid-fling.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(loadMoreIfNearBottom, 200);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Once a page has landed, check again so a list shorter than the look-ahead
  // keeps filling; keyboard navigation near the end prefetches without waiting
  // for a scroll.
  useEffect(() => {
    loadMoreIfNearBottom();
    if (selectionNearEnd) requestNextPage();
  }, [
    selectionNearEnd,
    articles.length,
    hasMore,
    isLoading,
    isLoadingMore,
    isFetchNextPageError,
    articleLoading,
  ]);

  let title = t(allFeedsLabelKey(articleFilter));
  if (selectedFeedId) {
    const feed = getFeedById(selectedFeedId);
    title = feed?.name ?? t("article.feedFallback");
  } else if (selectedGroupId) {
    const group = groups.find((g) => g.id === selectedGroupId);
    title = group?.name ?? t("article.groupFallback");
  }

  const pull = useListPull({
    containerRef: scrollRef,
    feedId: selectedFeedId,
    groupId: selectedGroupId,
    starred: articleFilter === "starred",
    name: selectedFeedId || selectedGroupId ? title : undefined,
  });

  const { newCount, showNew, freshAfter, snapshotId } = useNewArticles({
    feedId: selectedFeedId,
    groupId: selectedGroupId,
    articleFilter,
    articleCount: articles.length,
    scrollRef,
  });

  // Memoized: a selection change re-renders this component but not these passes.
  const unreadCount = useMemo(
    () => articles.filter((a) => a.unread).length,
    [articles],
  );
  // Unread rows not loaded yet still count, so the button stays usable.
  const scopeUnreadCount = useMemo(
    () =>
      articleFilter === "starred"
        ? 0
        : feeds
            .filter((f) =>
              selectedFeedId
                ? f.id === selectedFeedId
                : selectedGroupId
                  ? f.group_id === selectedGroupId
                  : true,
            )
            .reduce((sum, f) => sum + f.unread_count, 0),
    [feeds, articleFilter, selectedFeedId, selectedGroupId],
  );
  const feedDisplay = useMemo(
    () =>
      new Map(
        feeds.map((f) => [
          f.id,
          {
            name: f.name,
            faviconUrl: getFaviconUrl(f.link, f.site_url),
            openPermalink: f.open_permalink,
          },
        ]),
      ),
    [feeds],
  );
  const hasNoFeeds = !isFeedsLoading && feeds.length === 0;
  // A failed refill shows the footer's Retry instead of an endless skeleton.
  const isListLoading =
    isLoading || (articles.length === 0 && hasMore && !isFetchNextPageError);
  const showSkeleton = useDelayedFlag(isListLoading, 300);

  const handleToggleRead = useStableCallback(
    async (article: Item) => {
      if (article.id <= 0) return;

      try {
        if (article.unread) {
          // Pin before the request so the optimistic unread flip cannot
          // drop the row (still visible for undo) before the pin lands.
          pinRead([article.id]);
          await markItemsRead.mutateAsync([article.id]);
        } else {
          await markItemsUnread.mutateAsync([article.id]);
          unpinRead([article.id]);
        }
      } catch (error) {
        console.error("Failed to toggle read status:", error);
      }
    },
  );

  const handleToggleStar = useStableCallback(
    async (article: Item) => {
      try {
        if (isItemStarred(article.id, article.link)) {
          const bookmark = getBookmarkByItemId(article.id, article.link);
          if (bookmark) {
            await deleteBookmark.mutateAsync(bookmark.id);
          }
          return;
        }

        await createBookmark.mutateAsync(article);
      } catch (error) {
        console.error("Failed to toggle star:", error);
        toast.error(apiErrorMessage(error, t("article.toast.starFailed")));
      }
    },
  );

  const handleSelectArticle = useStableCallback(setSelectedArticle);

  const handleMarkAllAsRead = async () => {
    const unreadIds = articles
      .filter((a) => a.unread && a.id > 0)
      .map((a) => a.id);

    try {
      // Pin before the request, as handleToggleRead does: the optimistic
      // flip would otherwise empty the unread view and trigger a refill.
      pinRead(unreadIds);
      // Starred lists bookmarks, not a feed scope: only loaded rows apply.
      if (articleFilter === "starred" || snapshotId === null) {
        if (unreadIds.length === 0) return;
        await markItemsRead.mutateAsync(unreadIds);
      } else {
        await markScopeRead.mutateAsync({
          request: {
            max_id: snapshotId,
            ...(selectedFeedId ? { feed_id: selectedFeedId } : {}),
            ...(selectedGroupId ? { group_id: selectedGroupId } : {}),
          },
          loadedIds: unreadIds,
        });
      }
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const markAllReadDisabled = unreadCount === 0 && scopeUnreadCount === 0;
  useMarkAllReadShortcut(handleMarkAllAsRead, markAllReadDisabled);

  return (
    <div className="flex h-full flex-col">
      <ContentHeader className="pl-4 pr-2 sm:pl-6 sm:pr-2">
        <div className="flex min-w-0 items-center gap-1">
          <SidebarTrigger />
          <h2 className="truncate text-lg font-semibold">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ShowFilteredToggle
            feedId={selectedFeedId}
            disabled={articleFilter === "starred"}
          />
          {selectedFeedId && getFeedById(selectedFeedId) && (
            <TooltipButton
              label={t("feeds.tooltip.editFeed")}
              onClick={() => {
                const feed = getFeedById(selectedFeedId);
                if (feed) setEditFeedOpen(true, feed);
              }}
            >
              <Settings className="h-4 w-4" />
            </TooltipButton>
          )}
          <TooltipButton
            label={t("article.list.markAllRead")}
            shortcut="Shift+A"
            onClick={handleMarkAllAsRead}
            disabled={markAllReadDisabled}
          >
            <CheckCheck className="h-4 w-4" />
          </TooltipButton>
        </div>
      </ContentHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <FeedErrorLine feedId={selectedFeedId} />

        <PullIndicator pane="list" {...pull} />

        {/* Article list */}
        <ScrollBox
          ref={scrollRef}
          className="min-h-0 flex-1 overscroll-y-contain"
        >
          <NewArticlesPill count={newCount} onClick={showNew} />
          {isListLoading ? (
            showSkeleton && (
              <div className="space-y-2 px-4 py-2 sm:px-6">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-md bg-accent"
                  />
                ))}
              </div>
            )
          ) : articles.length === 0 ? (
            hasNoFeeds ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center sm:px-6">
                <p className="text-sm text-muted-foreground">
                  {t("article.list.noFeeds")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate({ to: "/feeds" })}
                >
                  {t("article.list.openFeedManagement")}
                </Button>
              </div>
            ) : hasMore ? (
              <ArticleListFooter
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                isError={isFetchNextPageError}
                fetchNextPage={fetchNextPage}
              />
            ) : (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center sm:px-6">
                <p className="text-sm text-muted-foreground">
                  {t("article.list.noArticles")}
                </p>
              </div>
            )
          ) : (
            <>
              <ArticleRows
                articles={articles}
                feedDisplay={feedDisplay}
                unknownFeedName={t("common.unknown")}
                freshAfter={freshAfter}
                isItemStarred={isItemStarred}
                getBookmarkByItemId={getBookmarkByItemId}
                onSelectArticle={handleSelectArticle}
                onToggleRead={handleToggleRead}
                onToggleStar={handleToggleStar}
              />
              <div ref={footerRef}>
                <ArticleListFooter
                  hasMore={hasMore}
                  isLoadingMore={isLoadingMore}
                  isError={isFetchNextPageError}
                  fetchNextPage={fetchNextPage}
                />
              </div>
            </>
          )}
        </ScrollBox>
      </div>
    </div>
  );
}
