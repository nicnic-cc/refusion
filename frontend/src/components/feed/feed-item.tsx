import { memo } from "react";
import { cn } from "@/lib/utils";
import { useIsFeedSelected, useUrlActions } from "@/hooks/use-url-state";
import { sidebarNodeKey, useSidebarNavStore, useUIStore } from "@/store";
import type { Feed } from "@/lib/api";
import { FeedRowIcon } from "@/components/feed/feed-row-icon";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

interface FeedItemProps {
  feed: Feed;
}

export const FeedItem = memo(function FeedItem({ feed }: FeedItemProps) {
  const { t } = useI18n();
  const isSelected = useIsFeedSelected(feed.id);
  const { setSelectedFeed } = useUrlActions();
  const setEditFeedOpen = useUIStore((s) => s.setEditFeedOpen);

  const feedKey = sidebarNodeKey.feed(feed.id);
  const isFocused = useSidebarNavStore(
    (s) => s.ringVisible && s.focusedKey === feedKey,
  );
  const setFocusedKey = useSidebarNavStore((s) => s.setFocusedKey);

  const handleSettingsClick = () => {
    setEditFeedOpen(true, feed);
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
      <div className="ml-2 flex h-6 w-6 shrink-0 items-center justify-end">
        <span className="text-xs text-muted-foreground md:group-hover:hidden md:group-focus-within:hidden">
          {feed.unread_count > 0 ? feed.unread_count : ""}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="inline-flex justify-end hover:bg-transparent dark:hover:bg-transparent md:hidden md:group-hover:inline-flex md:group-focus-within:inline-flex"
          onClick={handleSettingsClick}
          aria-label={t("feed.edit.title")}
        >
          <Settings className="text-muted-foreground group-hover/button:text-foreground" />
        </Button>
      </div>
    </div>
  );
});
