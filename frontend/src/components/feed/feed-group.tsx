import { memo } from "react";
import { CheckCheck, ChevronRight, Undo2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { loadedUnreadIdsForFeeds } from "@/queries/items";
import { pendingScope, useIsScopePending } from "@/store/pending-feed-reads";
import {
  undoDeferredRead,
  useDeferredScopeRead,
} from "@/lib/deferred-scope-read";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useIsGroupSelected, useUrlActions } from "@/hooks/use-url-state";
import { sidebarNodeKey, useSidebarNavStore } from "@/store";
import { useCollapsedGroupsStore } from "@/store/collapsed-groups";
import { usePrefetchList } from "@/hooks/use-prefetch-list";
import { FeedItem } from "./feed-item";
import type { Feed } from "@/lib/api";

interface FeedGroupProps {
  groupId: number;
  name: string;
  feeds: Feed[];
  unreadCount: number;
}

export const FeedGroup = memo(function FeedGroup({
  groupId,
  name,
  feeds,
  unreadCount,
}: FeedGroupProps) {
  const isOpen = useCollapsedGroupsStore(
    (s) => !s.collapsedIds.includes(groupId),
  );
  const setGroupOpen = useCollapsedGroupsStore((s) => s.setGroupOpen);
  const groupKey = sidebarNodeKey.group(groupId);
  const isFocused = useSidebarNavStore(
    (s) => s.ringVisible && s.focusedKey === groupKey,
  );
  const isFocusInsideGroup = useSidebarNavStore(
    (s) =>
      s.focusedKey !== null &&
      feeds.some((feed) => sidebarNodeKey.feed(feed.id) === s.focusedKey),
  );
  const setFocusedKey = useSidebarNavStore((s) => s.setFocusedKey);

  // Collapsing hides the child feeds; keep the keyboard highlight on the group.
  const setIsOpen = (open: boolean) => {
    setGroupOpen(groupId, open);
    if (!open && isFocusInsideGroup) {
      setFocusedKey(groupKey);
    }
  };
  const isSelected = useIsGroupSelected(groupId);
  const { setSelectedGroup } = useUrlActions();
  const prefetchList = usePrefetchList();
  const { t } = useI18n();
  const qc = useQueryClient();
  const pending = useIsScopePending(pendingScope.group(groupId));
  const startDeferredRead = useDeferredScopeRead();

  const handleMarkRead = () => {
    const feedIds = feeds.map((feed) => feed.id);
    startDeferredRead({
      scope: pendingScope.group(groupId),
      name,
      count: unreadCount,
      mark: {
        request: { max_id: Number.MAX_SAFE_INTEGER, group_id: groupId },
        loadedIds: () => loadedUnreadIdsForFeeds(qc, feedIds),
      },
    });
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="w-full min-w-0"
    >
      <div
        data-sidebar-key={groupKey}
        className={cn(
          "group flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-[15px] leading-6 transition-colors",
          isSelected
            ? "bg-accent text-accent-foreground"
            : "hover:bg-accent/50",
          isFocused && "ring-2 ring-inset ring-ring",
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className="shrink-0 p-1 -m-1 rounded-md transition-colors hover:bg-foreground/10"
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              isOpen && "rotate-90",
            )}
          />
        </button>
        <button
          type="button"
          onPointerDown={(e) => {
            if (e.button === 0) prefetchList({ feedId: null, groupId });
          }}
          onClick={() => {
            setFocusedKey(groupKey);
            setSelectedGroup(groupId);
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <span className="block min-w-0 flex-1 truncate">{name}</span>
        </button>
        <div className="ml-2 flex h-6 w-7 shrink-0 items-center justify-end">
          {pending ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className="inline-flex h-6 w-7 justify-end hover:bg-transparent dark:hover:bg-transparent"
              onClick={() => undoDeferredRead(pendingScope.group(groupId))}
              aria-label={t("feed.markRead.undo")}
            >
              <Undo2 className="size-3.5 text-primary" />
            </Button>
          ) : (
            unreadCount > 0 && (
              <>
                <span className="text-xs text-muted-foreground md:group-hover:hidden md:group-focus-within:hidden">
                  {unreadCount}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="inline-flex h-6 w-7 justify-end hover:bg-transparent dark:hover:bg-transparent md:hidden md:group-hover:inline-flex md:group-focus-within:inline-flex"
                  onClick={handleMarkRead}
                  aria-label={t("article.list.markAllRead")}
                >
                  <CheckCheck className="size-3.5 text-muted-foreground group-hover/button:text-foreground" />
                </Button>
              </>
            )
          )}
        </div>
      </div>
      <CollapsibleContent>
        <div className="w-full min-w-0 pl-5">
          {feeds.map((feed) => (
            <FeedItem key={feed.id} feed={feed} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});
