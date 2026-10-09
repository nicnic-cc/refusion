import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { usePreferencesStore } from "@/store/preferences";

interface ArticleListFooterProps {
  hasMore: boolean;
  isLoadingMore: boolean;
  isError: boolean;
  fetchNextPage: () => void;
}

export function ArticleListFooter({
  hasMore,
  isLoadingMore,
  isError,
  fetchNextPage,
}: ArticleListFooterProps) {
  const { t } = useI18n();
  const articleLoading = usePreferencesStore((s) => s.articleLoading);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // fetchNextPage is a fresh closure each render; the ref keeps the observer
  // from being rebuilt for that alone.
  const fetchRef = useRef(fetchNextPage);
  fetchRef.current = fetchNextPage;

  const observing =
    articleLoading === "scroll" && hasMore && !isLoadingMore && !isError;

  // Re-attaching after each load makes the observer report the current state
  // again, so a page too short to fill the viewport still pulls the next one.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!observing || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) fetchRef.current();
      },
      {
        root: sentinel.closest('[data-slot="scroll-area-viewport"]'),
        rootMargin: "0px",
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [observing]);

  if (!hasMore) return null;

  if (articleLoading === "button") {
    return (
      <div className="flex justify-center py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchNextPage}
          disabled={isLoadingMore}
          className="gap-2"
        >
          {isLoadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
          {isLoadingMore
            ? t("article.list.loading")
            : t("article.list.loadMore")}
        </Button>
      </div>
    );
  }

  return (
    <div ref={sentinelRef} className="flex justify-center py-4">
      {isError ? (
        <Button variant="outline" size="sm" onClick={fetchNextPage}>
          {t("article.list.retry")}
        </Button>
      ) : (
        <Loader2
          className="h-4 w-4 animate-spin text-muted-foreground"
          aria-label={t("article.list.loading")}
        />
      )}
    </div>
  );
}
