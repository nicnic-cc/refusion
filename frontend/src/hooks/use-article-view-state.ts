import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { useUrlState } from "@/hooks/use-url-state";
import type { Item } from "@/lib/api";
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
import { itemAPI } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
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

  const { articles, isStarredMode, isItemStarred, getBookmarkByItemId } =
    useArticleList({
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

  const articleIds = articles.map((a) => a.id);

  const storeArticle = selectedArticleId
    ? (articles.find((i) => i.id === selectedArticleId) ?? null)
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
  const bookmark = article ? getBookmarkByItemId(article.id) : null;
  const starred = article ? isItemStarred(article.id) : false;
  const safeArticleLink = article ? toSafeExternalUrl(article.link) : null;

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
        const bookmark = getBookmarkByItemId(article.id);
        if (bookmark) {
          await deleteBookmark.mutateAsync(bookmark.id);
        }
      } else {
        await createBookmark.mutateAsync(article);
      }
    } catch (error) {
      console.error("Failed to toggle star:", error);
      toast.error(t("article.toast.starFailed"));
    }
  };

  // Keyed by item id so navigating to another item drops the fetched text
  // without an effect; the text is never persisted.
  const [fullText, setFullText] = useState<{ id: number; html: string } | null>(
    null,
  );
  const [loadingId, setLoadingId] = useState<number | null>(null);
  // Last item whose full text was requested. Auto-load skips it (so w back to
  // feed text, or a failure, sticks) and older responses that land late are
  // dropped instead of overwriting it.
  const requestedIdRef = useRef<number | null>(null);
  const showingFullText = article !== null && fullText?.id === article.id;
  const loadingFullText = article !== null && loadingId === article.id;
  // Bookmark-only snapshots have negative ids and no server item to fetch for.
  const canLoadFullText =
    article !== null && article.id > 0 && safeArticleLink !== null;

  const handleToggleFullText = async () => {
    if (!article || !canLoadFullText || loadingFullText) return;
    if (showingFullText) {
      setFullText(null);
      return;
    }
    const id = article.id;
    requestedIdRef.current = id;
    setLoadingId(id);
    try {
      const res = await itemAPI.getFullContent(id);
      if (requestedIdRef.current === id) {
        setFullText({ id, html: res.data?.content ?? "" });
      }
    } catch (error) {
      console.error("Failed to load full article:", error);
      if (requestedIdRef.current === id) {
        toast.error(t("article.toast.fullTextFailed"));
      }
    } finally {
      setLoadingId((current) => (current === id ? null : current));
    }
  };

  const autoLoadFullText = useEffectEvent(() => {
    void handleToggleFullText();
  });
  const autoLoadId =
    feed?.full_content && canLoadFullText ? article.id : null;
  useEffect(() => {
    if (autoLoadId !== null && autoLoadId !== requestedIdRef.current) {
      autoLoadFullText();
    }
  }, [autoLoadId]);

  const handleOpenOriginal = () => {
    if (!safeArticleLink) return;
    window.open(safeArticleLink, "_blank", "noopener,noreferrer");
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
      onToggleFullText: () => {
        void handleToggleFullText();
      },
    });

  return {
    article,
    readArticle,
    canToggleRead,
    feed,
    bookmark,
    starred,
    safeArticleLink,
    handleToggleRead,
    handleToggleStar,
    handleOpenFeed,
    fullText: showingFullText ? fullText : null,
    loadingFullText,
    canLoadFullText,
    handleToggleFullText,
    goToNext,
    goToPrevious,
    hasNext,
    hasPrevious,
    close: () => setSelectedArticle(null),
    isOpen: selectedArticleId !== null,
  };
}

export type ArticleViewState = ReturnType<typeof useArticleViewState>;
