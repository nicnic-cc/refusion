import type { ArticleView } from "@/lib/api";

// Pressing a view's key while it is active leaves it for the feed's default,
// or for feed text when it already is the default; otherwise it switches to it.
export function toggledView(
  current: ArticleView,
  target: Exclude<ArticleView, "feed">,
  defaultView: ArticleView,
): ArticleView {
  if (current !== target) return target;
  return target === defaultView ? "feed" : defaultView;
}
