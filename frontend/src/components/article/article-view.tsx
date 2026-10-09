import {
  Circle,
  CircleCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  LoaderCircle,
  Star,
  X,
} from "lucide-react";
import { SheetTitle } from "@/components/ui/sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { processArticleContent } from "@/lib/content";
import { getFaviconUrl } from "@/lib/api/favicon";
import { FeedFavicon } from "@/components/feed/feed-favicon";
import { YoutubeEmbed } from "@/components/article/youtube-embed";
import { youtubeVideo } from "@/lib/youtube";
import type { ArticleViewState } from "@/hooks/use-article-view-state";

const getLinkDomain = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export function ArticleView({
  state,
  variant,
}: {
  state: ArticleViewState;
  variant: "drawer" | "pane";
}) {
  const { t } = useI18n();
  const {
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
    fullText,
    loadingFullText,
    canLoadFullText,
    handleToggleFullText,
    goToNext,
    goToPrevious,
    hasNext,
    hasPrevious,
    close,
  } = state;

  if (!article) return null;

  const video = safeArticleLink ? youtubeVideo(safeArticleLink) : null;
  const showingFullText = fullText !== null;
  const fullTextLabel = showingFullText
    ? t("article.action.feedContent")
    : t("article.action.fullText");

  const readLabel = (readArticle?.unread ?? false)
    ? t("article.action.markRead")
    : t("article.action.markUnread");
  const starLabel = starred
    ? t("article.action.unstar")
    : t("article.action.star");

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      {/* In the pane, match ContentHeader's fixed height so the borders line up. */}
      <div
        className={cn(
          "flex items-center justify-between border-b px-4 sm:px-6",
          variant === "pane" ? "h-14 shrink-0" : "py-3",
        )}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleToggleRead}
            disabled={!canToggleRead}
            aria-label={readLabel}
            title={readLabel}
          >
            {(readArticle?.unread ?? false) ? (
              <Circle className="h-4 w-4 text-muted-foreground" />
            ) : (
              <CircleCheck className="h-4 w-4 text-primary" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleToggleStar}
            aria-label={starLabel}
            title={starLabel}
          >
            <Star
              className={`h-4 w-4 ${starred ? "fill-current text-amber-500" : "text-muted-foreground"}`}
            />
          </Button>
          {safeArticleLink ? (
            <a
              href={safeArticleLink}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "icon-sm" })}
              aria-label={t("article.action.original")}
              title={t("article.action.original")}
            >
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          ) : (
            <Button
              variant="outline"
              size="icon-sm"
              disabled
              aria-label={t("article.action.original")}
              title={t("article.action.original")}
            >
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
          {article.id > 0 && (
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => void handleToggleFullText()}
              disabled={!canLoadFullText || loadingFullText}
              aria-label={fullTextLabel}
              aria-pressed={showingFullText}
              title={fullTextLabel}
            >
              {loadingFullText ? (
                <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <FileText
                  className={`h-4 w-4 ${showingFullText ? "text-primary" : "text-muted-foreground"}`}
                />
              )}
            </Button>
          )}
        </div>

        {variant === "drawer" && (
        <SheetTitle className="sr-only">{article.title}</SheetTitle>
      )}

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={close}
          aria-label={t("common.cancel")}
        >
          <X className="h-[18px] w-[18px] text-muted-foreground" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="min-h-0 flex-1">
        <article className="min-w-0 px-4 py-6 sm:px-6 sm:py-8">
          <div className="space-y-3">
            <h1 className="text-[28px] font-bold leading-[1.3]">
              {article.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {article.feed_id > 0 ? (
                <button
                  type="button"
                  onClick={handleOpenFeed}
                  className="flex max-w-48 items-center gap-1.5 rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
                >
                  {feed && (
                    <FeedFavicon
                      src={getFaviconUrl(feed.link, feed.site_url)}
                      className="h-3.5 w-3.5 rounded-sm"
                    />
                  )}
                  <span className="truncate hover:underline">
                    {feed?.name ?? bookmark?.feed_name ?? t("common.unknown")}
                  </span>
                </button>
              ) : (
                <span className="flex max-w-48 items-center gap-1.5 rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  <span className="truncate">
                    {bookmark?.feed_name ?? t("common.unknown")}
                  </span>
                </span>
              )}
              <span className="text-muted-foreground">
                {formatDate(article.pub_date)}
              </span>
              {safeArticleLink ? (
                <a
                  href={safeArticleLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-primary hover:underline"
                >
                  {getLinkDomain(safeArticleLink)}
                </a>
              ) : null}
            </div>
          </div>

          {video && (
            <div className="mt-6">
              <YoutubeEmbed
                id={video.id}
                vertical={video.vertical}
                title={article.title}
              />
            </div>
          )}

          <div
            className="typeset typeset-article mt-6 min-w-0 max-w-none"
            dangerouslySetInnerHTML={{
              __html: processArticleContent(
                showingFullText ? fullText.html : article.content,
                safeArticleLink ?? undefined,
              ),
            }}
          />
        </article>
      </ScrollArea>

      {/* Footer - Navigation */}
      <div className="flex items-center justify-between border-t px-4 py-3 sm:px-6">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={goToPrevious}
          disabled={!hasPrevious()}
          aria-label={t("common.previous")}
          title={t("common.previous")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={goToNext}
          disabled={!hasNext()}
          aria-label={t("common.next")}
          title={t("common.next")}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
