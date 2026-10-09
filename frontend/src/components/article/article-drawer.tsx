import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ArticleView, useArticleViewState } from "./article-view";

export function ArticleDrawer() {
  const state = useArticleViewState();

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      state.close();
    }
  };

  return (
    <Sheet open={state.isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-[max(840px,60vw)] p-0"
        showCloseButton={false}
      >
        <ArticleView state={state} variant="drawer" />
      </SheetContent>
    </Sheet>
  );
}
