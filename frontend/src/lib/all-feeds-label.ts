import type { ArticleFilter } from "@/lib/article-filter";
import type { TranslationKey } from "@/lib/i18n";

// One label for the unscoped list, shared by the sidebar row and the list title.
export function allFeedsLabelKey(filter: ArticleFilter): TranslationKey {
  if (filter === "unread") return "sidebar.allUnread";
  if (filter === "starred") return "sidebar.allStarred";
  return "sidebar.allFeeds";
}
