import { ArticleList } from "@/components/article/article-list";
import { ArticlePane } from "@/components/article/article-pane";
import { AppLayout } from "@/components/layout/app-layout";
import { usePanesFit } from "@/hooks/use-panes-fit";
import { usePreferencesStore } from "@/store";

export function ArticlePage() {
  const readingLayout = usePreferencesStore((s) => s.readingLayout);
  const panesFit = usePanesFit();
  const panes = readingLayout === "panes" && panesFit;

  if (!panes) {
    return (
      <AppLayout>
        <ArticleList />
      </AppLayout>
    );
  }

  return (
    <AppLayout readingPane>
      <div className="flex h-full">
        <div className="h-full w-80 shrink-0 border-r">
          <ArticleList />
        </div>
        <ArticlePane />
      </div>
    </AppLayout>
  );
}
