import { memo } from "react";
import { cn } from "@/lib/utils";
import {
  parseFilter,
  useIsFeedSelected,
  useUrlActions,
} from "@/hooks/use-url-state";
import { parsePositiveIntegerParam } from "@/lib/route-params";
import { articleListKey, useArticlePinsStore } from "@/store/article-pins";
import { sidebarNodeKey, useSidebarNavStore } from "@/store";
import { API_BASE } from "@/lib/api/client";
import { apiErrorMessage, type Feed } from "@/lib/api";
import { FeedRowIcon } from "@/components/feed/feed-row-icon";
import { CheckCheck, Undo2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { usePrefetchList } from "@/hooks/use-prefetch-list";
import { loadedUnreadIdsForFeed, useMarkScopeRead } from "@/queries/items";
import {
  UNDO_WINDOW_MS,
  useIsFeedReadPending,
  usePendingFeedReadsStore,
} from "@/store/pending-feed-reads";

// Read at commit time, when the row may be unmounted and the user elsewhere.
// Only the unread view pins; other views have nothing to keep on screen.
function openUnreadListKey(router: ReturnType<typeof useRouter>) {
  const matches = router.state.matches;
  const params = (matches[matches.length - 1]?.params ?? {}) as {
    filter?: string;
    feedId?: string;
    groupId?: string;
  };
  const filter = parseFilter(params.filter);
  if (filter !== "unread") return null;
  return articleListKey(
    parsePositiveIntegerParam(params.feedId),
    parsePositiveIntegerParam(params.groupId),
    filter,
  );
}

interface FeedItemProps {
  feed: Feed;
}

export const FeedItem = memo(function FeedItem({ feed }: FeedItemProps) {
  const { t } = useI18n();
  const isSelected = useIsFeedSelected(feed.id);
  const { setSelectedFeed } = useUrlActions();
  const prefetchList = usePrefetchList();
  const qc = useQueryClient();
  const markScopeRead = useMarkScopeRead();
  const router = useRouter();

  const feedKey = sidebarNodeKey.feed(feed.id);
  const isFocused = useSidebarNavStore(
    (s) => s.ringVisible && s.focusedKey === feedKey,
  );
  const setFocusedKey = useSidebarNavStore((s) => s.setFocusedKey);

  const pending = useIsFeedReadPending(feed.id);
  const { schedule, cancel } = usePendingFeedReadsStore.getState();
  const toastId = `feed-read-${feed.id}`;

  const handleMarkRead = () => {
    const count = feed.unread_count;
    // Everything the commit needs is captured here: the row may be unmounted
    // by then, and mutateAsync still settles, unlike per-call mutate callbacks.
    const { mutateAsync } = markScopeRead;
    const failedMessage = t("feed.markRead.failed");
    const request = {
      // The sidebar has no list snapshot, so this means everything up to now.
      max_id: Number.MAX_SAFE_INTEGER,
      feed_id: feed.id,
    };
    schedule(feed.id, {
      commit: () => {
        const loadedIds = loadedUnreadIdsForFeed(qc, feed.id);
        const listKey = openUnreadListKey(router);
        if (listKey !== null) {
          useArticlePinsStore.getState().pinItems(listKey, loadedIds);
        }
        mutateAsync({ request, loadedIds }).catch((error) => {
          toast.error(apiErrorMessage(error, failedMessage));
        });
      },
      flush: () => {
        // Same request as api.patch; keepalive lets it outlive the page.
        void fetch(`${API_BASE}/items/-/read-all`, {
          method: "PATCH",
          keepalive: true,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        }).catch(() => {});
      },
    });
    toast(
      t(count === 1 ? "feed.markRead.done.one" : "feed.markRead.done.other", {
        count,
        feed: feed.name,
      }),
      {
        id: toastId,
        duration: UNDO_WINDOW_MS,
        // An element replaces sonner's own action button, which fills itself
        // with the text colour (white in dark mode).
        action: (
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto shrink-0"
            onClick={handleUndo}
          >
            <Undo2 />
            {t("feed.markRead.undo")}
          </Button>
        ),
      },
    );
  };

  const handleUndo = () => {
    cancel(feed.id);
    toast.dismiss(toastId);
  };

  return (
    <div
      data-sidebar-key={feedKey}
      className={cn(
        "group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-[15px] leading-6 transition-colors",
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
        isFocused && "ring-2 ring-inset ring-ring",
      )}
    >
      <button
        type="button"
        onPointerDown={(e) => {
          if (e.button === 0) prefetchList({ feedId: feed.id, groupId: null });
        }}
        onClick={() => {
          setFocusedKey(feedKey);
          setSelectedFeed(feed.id);
        }}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <FeedRowIcon feed={feed} />
        <span className="block min-w-0 max-w-full flex-1 truncate">
          {feed.name}
        </span>
      </button>
      {pending ? (
        <div className="ml-2 flex h-6 w-7 shrink-0 items-center justify-end">
          <Button
            variant="ghost"
            size="icon-xs"
            className="inline-flex h-6 w-7 justify-end hover:bg-transparent dark:hover:bg-transparent"
            onClick={handleUndo}
            aria-label={t("feed.markRead.undo")}
          >
            <Undo2 className="size-3.5 text-primary" />
          </Button>
        </div>
      ) : (
        <div className="ml-2 flex h-6 w-7 shrink-0 items-center justify-end">
          <span className="text-xs text-muted-foreground md:group-hover:hidden md:group-focus-within:hidden">
            {feed.unread_count > 0 ? feed.unread_count : ""}
          </span>
          {feed.unread_count > 0 && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="inline-flex h-6 w-7 justify-end hover:bg-transparent dark:hover:bg-transparent md:hidden md:group-hover:inline-flex md:group-focus-within:inline-flex"
              onClick={handleMarkRead}
              aria-label={t("article.list.markAllRead")}
            >
              <CheckCheck className="size-3.5 text-muted-foreground group-hover/button:text-foreground" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
});
