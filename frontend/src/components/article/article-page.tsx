import { ArticleList } from "@/components/article/article-list";
import { ArticlePane } from "@/components/article/article-pane";
import { useReadingPane } from "@/hooks/use-reading-pane";

export function ArticlePage() {
  if (!useReadingPane()) {
    return <ArticleList />;
  }

  return (
    <div className="flex h-full">
      <div className="h-full w-80 shrink-0 border-r">
        <ArticleList />
      </div>
      <ArticlePane />
    </div>
  );
}
