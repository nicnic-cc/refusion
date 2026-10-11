import { useEffect } from "react";
import { defaultArticleFilter } from "@/lib/article-filter";
import { useFeeds } from "@/queries/feeds";
import { useGroups } from "@/queries/groups";
import { useUrlState } from "./use-url-state";

// Leaves a /feeds/:id or /groups/:id URL whose target no longer exists (old
// bookmark, deleted in another tab). Waits for a settled, successful list: a
// fetch in flight may still be about to add a just-created feed.
export function useMissingScopeRedirect() {
  const { selectedFeedId, selectedGroupId, selectTopLevelFilter } = useUrlState();
  const feeds = useFeeds();
  const groups = useGroups();

  const feedMissing =
    selectedFeedId !== null &&
    feeds.isSuccess &&
    !feeds.isFetching &&
    !(feeds.data ?? []).some((f) => f.id === selectedFeedId);
  const groupMissing =
    selectedGroupId !== null &&
    groups.isSuccess &&
    !groups.isFetching &&
    !(groups.data ?? []).some((g) => g.id === selectedGroupId);

  const missing = feedMissing || groupMissing;
  useEffect(() => {
    if (missing) selectTopLevelFilter(defaultArticleFilter);
  }, [missing, selectTopLevelFilter]);
}
