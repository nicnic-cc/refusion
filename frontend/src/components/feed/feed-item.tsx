import { memo } from "react";
import { cn } from "@/lib/utils";
import { useIsFeedSelected, useUrlActions } from "@/hooks/use-url-state";
import { sidebarNodeKey, useSidebarNavStore } from "@/store";
import type { Feed } from "@/lib/api";
import { FeedRowIcon } from "@/components/feed/feed-row-icon";
import { CheckCheck, Undo2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { usePrefetchList } from "@/hooks/use-prefetch-list";
import { loadedUnreadIdsForFeeds } from "@/queries/items";
import {
  pendingScope,
  useIsFeedCovered,
  useIsScopePending,
} from "@/store/pending-feed-reads";
import {
  undoDeferredRead,
  useDeferredScopeRead,
} from "@/lib/deferred-scope-read";

interface FeedItemProps {
  feed: Feed;
}

export const FeedItem = memo(function FeedItem({ feed }: FeedItemProps) {
  const { t } = useI18n();
  const isSelected = useIsFeedSelected(feed.id);
  const { setSelectedFeed } = useUrlActions();
  const prefetchList = usePrefetchList();
  const qc = useQueryClient();

  const feedKey = sidebarNodeKey.feed(feed.id);
  const isFocused = useSidebarNavStore(
    (s) => s.ringVisible && s.focusedKey === feedKey,
  );
  const setFocusedKey = useSidebarNavStore((s) => s.setFocusedKey);

  const covered = useIsFeedCovered(feed);
  const pending = useIsScopePending(pendingScope.feed(feed.id));
  const startDeferredRead = useDeferredScopeRead();

  const handleMarkRead = () => {
    startDeferredRead({
      scope: pendingScope.feed(feed.id),
      name: feed.name,
      count: feed.unread_count,
      mark: {
        // The sidebar has no list snapshot, so this means everything up to now.
        request: { max_id: Number.MAX_SAFE_INTEGER, feed_id: feed.id },
        loadedIds: () => loadedUnreadIdsForFeeds(qc, [feed.id]),
      },
    });
  };

  const handleUndo = () => undoDeferredRead(pendingScope.feed(feed.id));

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
      ) : covered ? (
        <div className="ml-2 h-6 w-7 shrink-0" />
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
