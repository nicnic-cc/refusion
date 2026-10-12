import { useEffect, useEffectEvent, useLayoutEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TooltipButton } from "@/components/common/tooltip-button";
import { ArticleFilterSwitch } from "./article-filter-switch";
import { ArticleItem } from "./article-item";
import { ShowFilteredToggle } from "./show-filtered-toggle";
import { ArticleListFooter } from "./article-list-footer";
import { ScrollBox } from "@/components/scroll-box";
import { ContentHeader } from "@/components/layout/content-header";
import { SidebarTrigger } from "@/components/layout/sidebar-trigger";
import {
  onArticleNavigationEnd,
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
import {
  articleListKey,
  useArticlePinsStore,
  useReadStatePins,
} from "@/store";
import type { Item } from "@/lib/api";

const SCROLL_LOOKAHEAD_VIEWPORTS = 2;
const PREFETCH_ROWS = 3;

export function ArticleList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const {
    articleFilter,
    setArticleFilter,
    selectedFeedId,
    selectedGroupId,
    selectedArticleId,
    setSelectedArticle,
  } = useUrlState();

  const {
    articles,
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

  const articleIds = articles.map((a) => a.id);
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // The layout stays mounted across pages, so the scroll box is reused: start
  // each new list at the top, before paint, instead of at the old offset.
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pinsKey]);

  const requestNextPage = useEffectEvent(() => {
    if (articleLoading !== "scroll") return;
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
    if (articleLoading !== "scroll" || !hasMore) return;
    pendingAdvanceRef.current = lastId;
    requestNextPage();
  });
  useEffect(
    () => onArticleNavigationEnd((lastId) => advanceAfterLoad(lastId)),
    [],
  );
  useEffect(() => {
    const pending = pendingAdvanceRef.current;
    if (pending === null) return;
    const index = articles.findIndex((a) => a.id === pending);
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
    selectedArticleId,
    hasMore,
    isFetchNextPageError,
    setSelectedArticle,
  ]);

  const selectedIndex = articles.findIndex((a) => a.id === selectedArticleId);
  const selectionNearEnd =
    selectedIndex >= 0 && selectedIndex >= articles.length - PREFETCH_ROWS;

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

  let title = t("article.list.all");
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

  const unreadCount = articles.filter((a) => a.unread).length;
  // Unread rows not loaded yet still count, so the button stays usable.
  const scopeUnreadCount =
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
          .reduce((sum, f) => sum + f.unread_count, 0);
  const hasNoFeeds = !isFeedsLoading && feeds.length === 0;
  const isListLoading = isLoading || (articles.length === 0 && hasMore);
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
        if (isItemStarred(article.id)) {
          const bookmark = getBookmarkByItemId(article.id);
          if (bookmark) {
            await deleteBookmark.mutateAsync(bookmark.id);
          }
          return;
        }

        await createBookmark.mutateAsync(article);
      } catch (error) {
        console.error("Failed to toggle star:", error);
        toast.error(t("article.toast.starFailed"));
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

      {!hasNoFeeds && (
        <div className="flex h-11 shrink-0 items-center justify-center border-b">
          <ArticleFilterSwitch
            value={articleFilter}
            onValueChange={setArticleFilter}
          />
        </div>
      )}

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
            ) : (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center sm:px-6">
                <p className="text-sm text-muted-foreground">
                  {t("article.list.noArticles")}
                </p>
              </div>
            )
          ) : (
            <>
              {articles.map((article) => {
                const feed = getFeedById(article.feed_id);
                const bookmark = getBookmarkByItemId(article.id);

                return (
                  <ArticleItem
                    key={article.id}
                    article={article}
                    isSelected={selectedArticleId === article.id}
                    onSelectArticle={handleSelectArticle}
                    onToggleRead={handleToggleRead}
                    onToggleStar={handleToggleStar}
                    canToggleRead={article.id > 0}
                    isFresh={freshAfter !== null && article.id > freshAfter}
                    isStarred={isItemStarred(article.id)}
                    feedName={feed?.name ?? bookmark?.feed_name ?? t("common.unknown")}
                    feedFaviconUrl={
                      feed ? getFaviconUrl(feed.link, feed.site_url) : null
                    }
                  />
                );
              })}
              <ArticleListFooter
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                isError={isFetchNextPageError}
                fetchNextPage={fetchNextPage}
              />
            </>
          )}
        </ScrollBox>
      </div>
    </div>
  );
}
