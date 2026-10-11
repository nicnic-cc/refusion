import { memo, useEffect, useRef } from "react";
import { Circle, Star, ExternalLink } from "lucide-react";
import { TooltipButton } from "@/components/common/tooltip-button";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import type { Item } from "@/lib/api";
import { FeedFavicon } from "@/components/feed/feed-favicon";
import { toSafeExternalUrl } from "@/lib/safe-url";
import { FilteredTag } from "./filtered-tag";

// Actions sit in the meta row: read stays visible but dimmed, the others appear
// on hover/focus and keep their space so the date doesn't shift.
const rowAction = "opacity-60 group-hover:opacity-100 group-focus-within:opacity-100";
const hoverAction = "invisible group-hover:visible group-focus-within:visible";
const mutedIcon = "text-muted-foreground group-hover/button:text-foreground";

interface ArticleItemProps {
  article: Item;
  isSelected: boolean;
  onSelectArticle: (articleId: number | null) => void;
  onToggleRead: (article: Item) => Promise<void>;
  onToggleStar: (article: Item) => Promise<void>;
  canToggleRead: boolean;
  isStarred: boolean;
  feedName: string;
  feedFaviconUrl: string | null;
  // Arrived with the last reload: plays the fade-out tint once.
  isFresh?: boolean;
}

export const ArticleItem = memo(function ArticleItem({
  article,
  isSelected,
  onSelectArticle,
  onToggleRead,
  onToggleStar,
  canToggleRead,
  isStarred,
  feedName,
  feedFaviconUrl,
  isFresh,
}: ArticleItemProps) {
  const { t } = useI18n();

  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSelected) rootRef.current?.scrollIntoView({ block: "nearest" });
  }, [isSelected]);
  const safeArticleLink = toSafeExternalUrl(article.link);

  const handleToggleRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canToggleRead) return;

    try {
      await onToggleRead(article);
    } catch (error) {
      console.error("Failed to toggle read status:", error);
    }
  };

  const handleToggleStar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await onToggleStar(article);
    } catch (error) {
      console.error("Failed to toggle star:", error);
    }
  };

  return (
    <div
      ref={rootRef}
      role="button"
      tabIndex={0}
      onClick={() => onSelectArticle(article.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelectArticle(article.id);
        }
      }}
      className={cn(
        "group flex w-full cursor-pointer items-start gap-4 border-b px-4 py-4 sm:px-6 text-left transition-colors hover:bg-accent/50",
        isSelected && "bg-accent",
        isFresh && "fresh-row",
        article.filtered && "opacity-50",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2 text-xs">
          <FeedFavicon src={feedFaviconUrl} className="h-3.5 w-3.5 rounded-sm" />
          <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">
            {feedName}
          </span>
          {article.filtered && <FilteredTag />}
          <span className="shrink-0 text-muted-foreground">
            {formatDate(article.pub_date)}
          </span>
          <div className="-my-1 flex shrink-0 items-center">
            <TooltipButton
              variant="ghost"
              size="icon-xs"
              label={
                article.unread
                  ? t("article.action.markRead")
                  : t("article.action.markUnread")
              }
              onClick={handleToggleRead}
              disabled={!canToggleRead}
              className={rowAction}
            >
              <Circle
                className={
                  article.unread ? "fill-primary text-primary" : mutedIcon
                }
              />
            </TooltipButton>
            <TooltipButton
              variant="ghost"
              size="icon-xs"
              label={
                isStarred ? t("article.action.unstar") : t("article.action.star")
              }
              onClick={handleToggleStar}
              className={hoverAction}
            >
              <Star
                className={
                  isStarred ? "fill-amber-500 text-amber-500" : mutedIcon
                }
              />
            </TooltipButton>
            <TooltipButton
              variant="ghost"
              size="icon-xs"
              label={t("article.action.openInBrowser")}
              href={safeArticleLink ?? undefined}
              disabled={!safeArticleLink}
              onClick={(e) => e.stopPropagation()}
              className={hoverAction}
            >
              <ExternalLink className={mutedIcon} />
            </TooltipButton>
          </div>
        </div>
        <h3
          className={cn(
            "line-clamp-3 text-[15px] leading-snug font-medium",
            article.unread ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {article.title}
        </h3>
      </div>
    </div>
  );
});
