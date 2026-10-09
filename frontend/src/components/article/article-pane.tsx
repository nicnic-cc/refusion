import { BookOpen } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { ArticleView, useArticleViewState } from "./article-view";

export function ArticlePane() {
  const { t } = useI18n();
  const state = useArticleViewState();

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col">
      {state.isOpen && state.article ? (
        <ArticleView state={state} variant="pane" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <BookOpen className="size-12" aria-hidden="true" />
          <p className="text-sm">{t("article.pane.empty")}</p>
        </div>
      )}
    </section>
  );
}
