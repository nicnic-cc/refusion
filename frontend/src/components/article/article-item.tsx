import { useEffect, useRef } from "react";
import { Circle, CircleCheck, Star, ExternalLink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate, extractSummary } from "@/lib/utils";
import type { Item } from "@/lib/api";
import { FeedFavicon } from "@/components/feed/feed-favicon";
import { toSafeExternalUrl } from "@/lib/safe-url";

// Both hover variants are needed: ghost's dark:hover:bg-muted/50 would
// otherwise fade the resting bg-muted on hover in dark mode.
const mutedAction =
  "bg-muted hover:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_12%)] dark:hover:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_12%)]";
const mutedIcon = "text-muted-foreground group-hover/button:text-foreground";

interface ArticleItemProps {
  article: Item;
  selectedArticleId: number | null;
  onSelectArticle: (articleId: number | null) => void;
  onToggleRead: (article: Item) => Promise<void>;
  onToggleStar: (article: Item) => Promise<void>;
  canToggleRead: boolean;
  isStarred: boolean;
  feedName: string;
  feedFaviconUrl: string | null;
}

export function ArticleItem({
  article,
  selectedArticleId,
  onSelectArticle,
  onToggleRead,
  onToggleStar,
  canToggleRead,
  isStarred,
  feedName,
  feedFaviconUrl,
}: ArticleItemProps) {
  const { t } = useI18n();

  const isSelected = selectedArticleId === article.id;
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
        "group relative flex w-full cursor-pointer items-start gap-4 border-b px-4 py-4 sm:px-6 text-left transition-colors hover:bg-accent/50",
        isSelected && "bg-accent",
      )}
    >
      {/* Article Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3
          className={cn(
            "line-clamp-2 text-[15px] leading-snug font-medium",
            article.unread ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {article.title}
        </h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {extractSummary(article.content, 150)}
        </p>
        <div className="flex items-center gap-2 text-xs">
          <FeedFavicon src={feedFaviconUrl} className="h-3.5 w-3.5 rounded-sm" />
          <span className="truncate font-medium text-muted-foreground">
            {feedName}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="shrink-0 text-muted-foreground">
            {formatDate(article.pub_date)}
          </span>
        </div>
      </div>

      {/* Article Actions */}
      <div className="absolute right-2 top-2 hidden items-center gap-1 group-hover:flex">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleToggleRead}
          disabled={!canToggleRead}
          className={cn(
            article.unread
              ? mutedAction
              : "bg-primary/10 hover:bg-primary/20 dark:hover:bg-primary/20",
          )}
          aria-label={
            article.unread
              ? t("article.action.markRead")
              : t("article.action.markUnread")
          }
          title={
            article.unread
              ? t("article.action.markRead")
              : t("article.action.markUnread")
          }
        >
          {article.unread ? (
            <Circle className={mutedIcon} />
          ) : (
            <CircleCheck className="text-primary" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleToggleStar}
          className={cn(
            isStarred
              ? "bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/40 dark:hover:bg-amber-950/70"
              : mutedAction,
          )}
          aria-label={
            isStarred ? t("article.action.unstar") : t("article.action.star")
          }
          title={isStarred ? t("article.action.unstar") : t("article.action.star")}
        >
          <Star
            className={cn(
              isStarred
                ? "fill-amber-500 text-amber-500"
                : mutedIcon,
            )}
          />
        </Button>
        {safeArticleLink ? (
          <a
            href={safeArticleLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), mutedAction)}
            aria-label={t("article.action.openInBrowser")}
            title={t("article.action.openInBrowser")}
          >
            <ExternalLink className={mutedIcon} />
          </a>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled
            className={mutedAction}
            aria-label={t("article.action.openInBrowser")}
            title={t("article.action.openInBrowser")}
          >
            <ExternalLink className={mutedIcon} />
          </Button>
        )}
      </div>
    </div>
  );
}
