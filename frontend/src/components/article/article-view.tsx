import { useMemo } from "react";
import {
  Circle,
  CircleCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Globe,
  LoaderCircle,
  Star,
  X,
} from "lucide-react";
import { SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TooltipButton } from "@/components/common/tooltip-button";
import { ScrollBox } from "@/components/scroll-box";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { processArticleContent } from "@/lib/content";
import { getFaviconUrl } from "@/lib/api/favicon";
import { FeedFavicon } from "@/components/feed/feed-favicon";
import { YoutubeEmbed } from "@/components/article/youtube-embed";
import { WebPageFrame } from "@/components/article/web-page-frame";
import { youtubeVideo } from "@/lib/youtube";
import { ArticleAppearance } from "@/components/article/article-appearance";
import { useArticleAppearanceStyles } from "@/hooks/use-article-appearance-styles";
import type { ArticleViewState } from "@/hooks/use-article-view-state";
import { useIsMobile } from "@/hooks/use-mobile";

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
    safeOpenLink,
    handleToggleRead,
    handleToggleStar,
    handleOpenFeed,
    fullText,
    loadingFullText,
    canLoadFullText,
    handleToggleFullText,
    showingWebPage,
    canShowWebPage,
    handleToggleWebPage,
    webPageUrl,
    goToNext,
    goToPrevious,
    hasNext,
    hasPrevious,
    close,
  } = state;

  const appearance = useArticleAppearanceStyles();
  const isMobile = useIsMobile();

  const showingFullText = fullText !== null;
  const articleHtml = article?.content;
  const fullTextHtml = fullText?.html;
  // Sanitizing is costly and the view re-renders on read-state and cache updates;
  // the inputs are strings, so unchanged content keeps the memo.
  const processedHtml = useMemo(
    () =>
      processArticleContent(
        (showingFullText ? fullTextHtml : articleHtml) ?? "",
        safeArticleLink ?? undefined,
      ),
    [showingFullText, fullTextHtml, articleHtml, safeArticleLink],
  );

  if (!article) return null;

  const video = safeArticleLink ? youtubeVideo(safeArticleLink) : null;
  const fullTextLabel = showingFullText
    ? t("article.action.feedContent")
    : t("article.action.fullText");

  const readLabel = (readArticle?.unread ?? false)
    ? t("article.action.markRead")
    : t("article.action.markUnread");
  const starLabel = starred
    ? t("article.action.unstar")
    : t("article.action.star");

  const prevButton = (
    <TooltipButton
      label={t("common.previous")}
      shortcut="k"
      onClick={goToPrevious}
      disabled={!hasPrevious()}
    >
      <ChevronLeft className="h-4 w-4" />
    </TooltipButton>
  );
  const nextButton = (
    <TooltipButton
      label={t("common.next")}
      shortcut="j"
      onClick={goToNext}
      disabled={!hasNext()}
    >
      <ChevronRight className="h-4 w-4" />
    </TooltipButton>
  );

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
          <TooltipButton
            label={readLabel}
            shortcut="m"
            onClick={handleToggleRead}
            disabled={!canToggleRead}
          >
            {(readArticle?.unread ?? false) ? (
              <Circle className="h-4 w-4 text-muted-foreground" />
            ) : (
              <CircleCheck className="h-4 w-4 text-primary" />
            )}
          </TooltipButton>
          <TooltipButton
            label={starLabel}
            shortcut="s"
            onClick={handleToggleStar}
          >
            <Star
              className={`h-4 w-4 ${starred ? "fill-current text-amber-500" : "text-muted-foreground"}`}
            />
          </TooltipButton>
          {article.id > 0 && (
            <TooltipButton
              label={fullTextLabel}
              shortcut="w"
              onClick={() => void handleToggleFullText()}
              disabled={!canLoadFullText || (loadingFullText && !showingWebPage)}
              pressed={showingFullText}
            >
              {loadingFullText ? (
                <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <FileText
                  className={`h-4 w-4 ${showingFullText ? "text-primary" : "text-muted-foreground"}`}
                />
              )}
            </TooltipButton>
          )}
          {article.id > 0 && (
            <TooltipButton
              label={t("article.action.webPage")}
              shortcut="Shift+W"
              onClick={handleToggleWebPage}
              disabled={!canShowWebPage}
              pressed={showingWebPage}
            >
              <Globe
                className={`h-4 w-4 ${showingWebPage ? "text-primary" : "text-muted-foreground"}`}
              />
            </TooltipButton>
          )}
          <ArticleAppearance />
          <TooltipButton
            label={t("article.action.original")}
            shortcut="o"
            href={safeOpenLink ?? undefined}
            disabled={!safeOpenLink}
          >
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </TooltipButton>
        </div>

        {variant === "drawer" && (
        <SheetTitle className="sr-only">{article.title}</SheetTitle>
      )}

        <div className="flex items-center gap-2">
          {!isMobile && prevButton}
          {!isMobile && nextButton}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={close}
            aria-label={t("common.cancel")}
          >
            <X className="h-[18px] w-[18px] text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Content. Keyed so each article opens at the top; the subtree holds no state worth keeping. */}
      {showingWebPage && webPageUrl ? (
        <WebPageFrame
          articleId={article.id}
          feedId={article.feed_id}
          src={webPageUrl}
          title={article.title}
        />
      ) : (
        <ScrollBox key={article.id} className="min-h-0 flex-1">
          <article className="min-w-0 px-4 py-6 sm:px-6 sm:py-8">
            <div className="space-y-3">
              <h1
                className="text-[28px] font-bold leading-[1.3]"
                style={appearance.title}
              >
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
                {safeOpenLink ? (
                  <a
                    href={safeOpenLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-primary hover:underline"
                  >
                    {getLinkDomain(safeOpenLink)}
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
              style={appearance.body}
              dangerouslySetInnerHTML={{ __html: processedHtml }}
            />
          </article>
        </ScrollBox>
      )}

      {/* Footer - Navigation (mobile only: in thumb reach; desktop has it in the header) */}
      {isMobile && (
        <div className="flex items-center justify-between border-t px-4 py-3 sm:px-6">
          {prevButton}
          {nextButton}
        </div>
      )}
    </div>
  );
}
