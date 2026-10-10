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

  if (!hasMore) return null;

  if (articleLoading === "button") {
    return (
      <div className="flex h-14 items-center justify-center">
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
    <div className="flex h-14 items-center justify-center">
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
