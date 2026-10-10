import { cn } from "@/lib/utils";
import { useUrlState } from "@/hooks/use-url-state";
import { useUIStore } from "@/store";
import { getFaviconUrl } from "@/lib/api/favicon";
import type { Feed } from "@/lib/api";
import { FeedFavicon } from "@/components/feed/feed-favicon";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

interface FeedItemProps {
  feed: Feed;
}

export function FeedItem({ feed }: FeedItemProps) {
  const { t } = useI18n();
  const { selectedFeedId, setSelectedFeed } = useUrlState();
  const { setEditFeedOpen } = useUIStore();

  const isSelected = selectedFeedId === feed.id;
  const faviconUrl = getFaviconUrl(feed.link, feed.site_url);

  const handleSettingsClick = () => {
    setEditFeedOpen(true, feed);
  };

  return (
    <div
      className={cn(
        "group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-[15px] leading-6 transition-colors",
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
      )}
    >
      <button
        type="button"
        onClick={() => setSelectedFeed(feed.id)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <FeedFavicon src={faviconUrl} className="h-4 w-4" />
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
}
