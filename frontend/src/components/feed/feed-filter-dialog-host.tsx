import type { Feed } from "@/lib/api";
import { useFeedFilter } from "@/queries/feed-filters";
import { FilterDialog } from "./filter-dialog";

// Owns the filter lookup so the page does not subscribe to the filters query.
export function FeedFilterDialogHost({
  feed,
  open,
  onOpenChange,
}: {
  feed: Feed;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const filter = useFeedFilter(feed.id);
  return (
    <FilterDialog
      feed={feed}
      filter={filter}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
