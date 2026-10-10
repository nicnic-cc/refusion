import { useEffect, useEffectEvent, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipButton } from "@/components/common/tooltip-button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArticleItem } from "./article-item";
import { ArticleListFooter } from "./article-list-footer";
import { ContentHeader } from "@/components/layout/content-header";
import { SidebarTrigger } from "@/components/layout/sidebar-trigger";
import { useArticleNavigation } from "@/hooks/use-keyboard";
import { useUrlState, type ArticleFilter } from "@/hooks/use-url-state";
import { useArticleList } from "@/hooks/use-article-list";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { usePreferencesStore } from "@/store/preferences";
import { useMarkItemsRead, useMarkItemsUnread } from "@/queries/items";
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

  // Same rule as yarr's itemListCloseToBottom: load only near the bottom, and
  // not while the empty-list refill above is already fetching.
  const loadMoreIfNearBottom = useEffectEvent(() => {
    const el = scrollRef.current;
    if (!el || el.scrollHeight === 0 || articles.length === 0) return;
    if (articleLoading !== "scroll") return;
    if (isLoading || isLoadingMore || isFetchNextPageError || !hasMore) return;

    const scale =
      (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) /
      16;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 70 * scale) {
      fetchNextPage();
    }
  });

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

  // Once a page has landed, check again so a list shorter than the viewport
  // keeps filling.
  useEffect(() => {
    loadMoreIfNearBottom();
  }, [
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

  const unreadCount = articles.filter((a) => a.unread).length;
  const hasNoFeeds = !isFeedsLoading && feeds.length === 0;

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
      }
    },
  );

  const handleSelectArticle = useStableCallback(setSelectedArticle);

  const handleMarkAllAsRead = async () => {
    const unreadIds = articles
      .filter((a) => a.unread && a.id > 0)
      .map((a) => a.id);

    if (unreadIds.length === 0) return;

    try {
      await markItemsRead.mutateAsync(unreadIds);
      pinRead(unreadIds);
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <ContentHeader className="pl-4 pr-2 sm:pl-6 sm:pr-2">
        <div className="flex min-w-0 items-center gap-1">
          <SidebarTrigger />
          <h2 className="truncate text-lg font-semibold">{title}</h2>
        </div>
        <TooltipButton
          label={t("article.list.markAllRead")}
          onClick={handleMarkAllAsRead}
          disabled={unreadCount === 0}
        >
          <CheckCheck className="h-4 w-4" />
        </TooltipButton>
      </ContentHeader>

      {/* Article area with filter tabs */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden pt-3">
        {/* Filter tabs - hidden when no articles exist */}
        {!hasNoFeeds && (articles.length > 0 || articleFilter !== "all") && (
          <Tabs
            className="px-4 sm:px-6"
            value={articleFilter}
            onValueChange={(v) => setArticleFilter(v as ArticleFilter)}
          >
            <TabsList>
              <TabsTrigger value="all">{t("article.filter.all")}</TabsTrigger>
              <TabsTrigger value="unread">{t("article.filter.unread")}</TabsTrigger>
              <TabsTrigger value="starred">
                {t("article.filter.starred")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* Article list */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {isLoading || (articles.length === 0 && hasMore) ? (
            <div className="space-y-2 px-4 py-2 sm:px-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-md bg-accent"
                />
              ))}
            </div>
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
        </div>
      </div>
    </div>
  );
}
