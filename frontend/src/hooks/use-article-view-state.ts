import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { useUrlState } from "@/hooks/use-url-state";
import type { ArticleView, Item } from "@/lib/api";
import {
  useItem,
  useMarkItemsRead,
  useMarkItemsUnread,
} from "@/queries/items";
import { useFeedLookup } from "@/queries/feeds";
import {
  useCreateBookmark,
  useDeleteBookmark,
} from "@/queries/bookmarks";
import { useArticleList } from "@/hooks/use-article-list";
import { useArticleNavigation } from "@/hooks/use-keyboard";
import { useAutoMarkRead } from "@/hooks/use-auto-mark-read";
import { apiErrorMessage, itemAPI } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { toggledView } from "@/lib/article-view";
import { articleOpenLink } from "@/lib/article-link";
import { toSafeExternalUrl } from "@/lib/safe-url";
import { useReadStatePins, usePreferencesStore } from "@/store";
import { autoMarkReadDelayMs } from "@/store/preferences";

export function useArticleViewState() {
  const { t } = useI18n();
  const {
    selectedArticleId,
    setSelectedArticle,
    setSelectedFeed,
    selectedFeedId,
    selectedGroupId,
    articleFilter,
  } = useUrlState();
  const { getFeedById } = useFeedLookup();

  const {
    articles,
    articleIds,
    indexById,
    isStarredMode,
    isItemStarred,
    getBookmarkByItemId,
  } = useArticleList({
    feedId: selectedFeedId,
    groupId: selectedGroupId,
    articleFilter,
  });

  const markRead = useMarkItemsRead();
  const markUnread = useMarkItemsUnread();
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();

  const { pinRead, unpinRead } = useReadStatePins({
    feedId: selectedFeedId,
    groupId: selectedGroupId,
    articleFilter,
  });

  const storeArticle =
    selectedArticleId !== null
      ? (articles[indexById.get(selectedArticleId) ?? -1] ?? null)
      : null;

  const shouldFetchArticle =
    selectedArticleId !== null &&
    selectedArticleId > 0 &&
    (isStarredMode || storeArticle === null);
  const { data: fetchedArticle } = useItem(
    selectedArticleId,
    shouldFetchArticle,
  );

  const article: Item | null =
    (isStarredMode ? fetchedArticle ?? storeArticle : storeArticle ?? fetchedArticle) ??
    null;
  // Read state comes from the in-hand row (list/bookmark cache), not the
  // detail refetch: in starred mode the fetched detail can disagree with the
  // row, and the header toggle, the auto-mark timer, and the veto must all
  // watch the same unread bit or a manual mark-unread gets overwritten.
  const readArticle = storeArticle ?? fetchedArticle ?? null;
  const canToggleRead = readArticle !== null && readArticle.id > 0;
  const feed = article ? getFeedById(article.feed_id) : null;
  const bookmark = article
    ? getBookmarkByItemId(article.id, article.link)
    : null;
  const starred = article ? isItemStarred(article.id, article.link) : false;
  const safeArticleLink = article ? toSafeExternalUrl(article.link) : null;
  const safeOpenLink = article
    ? toSafeExternalUrl(articleOpenLink(article, feed?.open_permalink ?? false))
    : null;

  const autoMarkRead = usePreferencesStore((s) => s.autoMarkRead);
  const autoMarkDelayMs = autoMarkReadDelayMs(autoMarkRead);

  // The target is not gated on the setting: null means the drawer left the
  // article, which is exactly the event that must clear the veto. "Feature
  // off" travels as delayMs === null instead.
  useAutoMarkRead({
    target:
      readArticle && readArticle.id > 0
        ? { id: readArticle.id, unread: readArticle.unread }
        : null,
    delayMs: autoMarkDelayMs,
    // mutate and pinRead must share one synchronous turn (see hook docs).
    onMarkRead: (id) => {
      markRead.mutate([id]);
      pinRead([id]);
    },
    hasPendingMutation: () => markRead.isPending || markUnread.isPending,
  });

  const handleToggleRead = async () => {
    if (!readArticle || !canToggleRead) return;
    try {
      if (readArticle.unread) {
        // Pin before the request: the optimistic unread flip drops the row
        // from the unread list (and with it this drawer's content) until
        // the pin lands — the await would flash a blank pane.
        pinRead([readArticle.id]);
        await markRead.mutateAsync([readArticle.id]);
      } else {
        await markUnread.mutateAsync([readArticle.id]);
        unpinRead([readArticle.id]);
      }
    } catch (error) {
      console.error("Failed to toggle read status:", error);
    }
  };

  const handleToggleStar = async () => {
    if (!article) return;
    try {
      if (starred) {
        const bookmark = getBookmarkByItemId(article.id, article.link);
        if (bookmark) {
          await deleteBookmark.mutateAsync(bookmark.id);
        }
      } else {
        await createBookmark.mutateAsync(article);
      }
    } catch (error) {
      console.error("Failed to toggle star:", error);
      toast.error(apiErrorMessage(error, t("article.toast.starFailed")));
    }
  };

  // Bookmark-only snapshots have negative ids and no server item to fetch for.
  const canLoadFullText =
    article !== null && article.id > 0 && safeOpenLink !== null;
  const canShowWebPage = canLoadFullText;
  const defaultView: ArticleView = canLoadFullText
    ? (feed?.default_view ?? "feed")
    : "feed";

  // The view picked by the user for one article. Keyed by id so another
  // article falls back to its feed's default, and a pick of "feed" on a "full"
  // feed is not undone by the auto-load.
  const [choice, setChoice] = useState<{
    id: number;
    view: ArticleView;
  } | null>(null);
  const view: ArticleView =
    article !== null && choice?.id === article.id ? choice.view : defaultView;

  // The fetched text is kept per item id and never persisted. Responses
  // superseded by a newer request are dropped, so they cannot overwrite it.
  const [fullTextData, setFullTextData] = useState<{
    id: number;
    html: string;
  } | null>(null);
  const latestRequestIdRef = useRef<number | null>(null);
  const showingFullText =
    article !== null && view === "full" && fullTextData?.id === article.id;
  // In the full view without text means a request is on its way: a failure
  // leaves the view (see loadFullText).
  const loadingFullText =
    article !== null && view === "full" && fullTextData?.id !== article.id;
  const showingWebPage = article !== null && view === "web";

  const loadFullText = (id: number) => {
    if (fullTextData?.id === id) return;
    latestRequestIdRef.current = id;
    itemAPI
      .getFullContent(id)
      .then((res) => {
        if (latestRequestIdRef.current === id) {
          setFullTextData({ id, html: res.data?.content ?? "" });
        }
      })
      .catch((error) => {
        console.error("Failed to load full article:", error);
        if (latestRequestIdRef.current !== id) return;
        toast.error(t("article.toast.fullTextFailed"));
        // Only a different pick for this same article is kept. A choice keyed
        // to another article must not block the fallback, or this one stays in
        // "full" with no text (endless spinner).
        const fallback = toggledView("full", "full", defaultView);
        setChoice((current) =>
          current !== null && current.id === id && current.view !== "full"
            ? current
            : { id, view: fallback },
        );
      });
  };

  const toggleView = (target: "full" | "web") => {
    if (!article || !canLoadFullText) return;
    setChoice({ id: article.id, view: toggledView(view, target, defaultView) });
  };
  const handleToggleFullText = () => toggleView("full");
  const handleToggleWebPage = () => toggleView("web");

  // Entering the full view by any route (w, or a "full" feed default) fetches.
  const startFullTextLoad = useEffectEvent(() => {
    if (article) loadFullText(article.id);
  });
  const fullViewId = view === "full" && canLoadFullText ? article.id : null;
  useEffect(() => {
    if (fullViewId !== null) startFullTextLoad();
  }, [fullViewId]);

  const handleOpenOriginal = () => {
    if (!safeOpenLink) return;
    window.open(safeOpenLink, "_blank", "noopener,noreferrer");
  };

  const handleOpenFeed = () => {
    if (!article || article.feed_id <= 0) return;
    setSelectedFeed(article.feed_id);
  };

  const { goToNext, goToPrevious, hasNext, hasPrevious } =
    useArticleNavigation(articleIds, {
      enabled: selectedArticleId !== null,
      onToggleRead: () => {
        void handleToggleRead();
      },
      onToggleStar: () => {
        void handleToggleStar();
      },
      onOpenOriginal: handleOpenOriginal,
      onToggleFullText: handleToggleFullText,
      onToggleWebPage: handleToggleWebPage,
    });

  return {
    article,
    readArticle,
    canToggleRead,
    feed,
    bookmark,
    starred,
    safeArticleLink,
    safeOpenLink,
    handleToggleRead,
    handleToggleStar,
    handleOpenFeed,
    fullText: showingFullText ? fullTextData : null,
    loadingFullText,
    canLoadFullText,
    handleToggleFullText,
    showingWebPage,
    canShowWebPage,
    handleToggleWebPage,
    webPageUrl: showingWebPage ? itemAPI.pageUrl(article.id) : null,
    goToNext,
    goToPrevious,
    hasNext,
    hasPrevious,
    close: () => setSelectedArticle(null),
    isOpen: selectedArticleId !== null,
  };
}

export type ArticleViewState = ReturnType<typeof useArticleViewState>;
