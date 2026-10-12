import { ArticleList } from "@/components/article/article-list";
import { ArticlePane } from "@/components/article/article-pane";
import { useReadingPane } from "@/hooks/use-reading-pane";
import { cn } from "@/lib/utils";

export function ArticlePage() {
  const readingPane = useReadingPane();

  // Same tree position in both modes keeps the list mounted across the breakpoint.
  return (
    <div className="flex h-full">
      <div className={cn("h-full", readingPane ? "w-80 shrink-0 border-r" : "min-w-0 flex-1")}>
        <ArticleList />
      </div>
      {readingPane && <ArticlePane />}
    </div>
  );
}
