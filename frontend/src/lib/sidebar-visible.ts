import type { Feed } from "@/lib/api";
import type { ArticleFilter } from "@/lib/article-filter";

interface VisibleFeedsInput {
  feeds: Feed[];
  filter: ArticleFilter;
  starredFeedIds: ReadonlySet<number>;
  selectedFeedId: number | null;
  selectedGroupId: number | null;
  stickyIds: ReadonlySet<number>;
}

// Under "unread"/"starred" the tree only lists feeds with something to show.
// Selection, errors and sticky ids stay so rows don't vanish under the reader.
export function getVisibleFeedIds({
  feeds,
  filter,
  starredFeedIds,
  selectedFeedId,
  selectedGroupId,
  stickyIds,
}: VisibleFeedsInput): Set<number> {
  const visible = new Set<number>();
  for (const feed of feeds) {
    const matches =
      filter === "all" ||
      (filter === "unread" && feed.unread_count > 0) ||
      (filter === "starred" && starredFeedIds.has(feed.id));
    if (
      matches ||
      feed.id === selectedFeedId ||
      (selectedGroupId !== null && feed.group_id === selectedGroupId) ||
      Boolean(feed.fetch_state.last_error?.trim()) ||
      stickyIds.has(feed.id)
    ) {
      visible.add(feed.id);
    }
  }
  return visible;
}
