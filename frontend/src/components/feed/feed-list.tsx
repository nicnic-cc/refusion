import { useMemo } from "react";
import { useLocation } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { ScrollBox } from "@/components/scroll-box";
import { isArticleFilter } from "@/lib/article-filter";
import { allFeedsLabelKey } from "@/lib/all-feeds-label";
import { useGroups } from "@/queries/groups";
import { useFeedLookup, useUnreadCounts } from "@/queries/feeds";
import { useBookmarkLookup } from "@/queries/bookmarks";
import { useUrlState } from "@/hooks/use-url-state";
import { useSidebarNavigation } from "@/hooks/use-sidebar-navigation";
import { getSidebarGroups } from "@/lib/groups";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { sidebarNodeKey, useSidebarNavStore, type SidebarNode } from "@/store";
import { useCollapsedGroupsStore } from "@/store/collapsed-groups";
import { FeedGroup } from "./feed-group";

export function FeedList() {
  const { t } = useI18n();
  const { data: groups = [], isLoading } = useGroups();
  const { feeds, getFeedsByGroup } = useFeedLookup();
  const { getTotalUnreadCount } = useUnreadCounts();
  const { total: starredTotal } = useBookmarkLookup();
  const {
    selectedFeedId,
    selectedGroupId,
    articleFilter,
    selectAllFeeds,
  } = useUrlState({ article: false });
  const pathname = useLocation({ select: (l) => l.pathname });
  const collapsedIds = useCollapsedGroupsStore((s) => s.collapsedIds);
  const ringKey = useSidebarNavStore((s) =>
    s.ringVisible ? s.focusedKey : null,
  );
  const setFocusedKey = useSidebarNavStore((s) => s.setFocusedKey);
  const firstPathSegment = pathname.split("/").filter(Boolean)[0];
  const isOnHomePage =
    typeof firstPathSegment === "string" && isArticleFilter(firstPathSegment);
  const isTopLevelSelected =
    isOnHomePage && selectedFeedId === null && selectedGroupId === null;
  const sidebarGroups = useMemo(
    () => getSidebarGroups(groups, feeds),
    [groups, feeds],
  );
  // Stable between renders so memoized groups skip re-rendering on URL changes.
  const feedsByGroup = useMemo(
    () => new Map(sidebarGroups.map((g) => [g.id, getFeedsByGroup(g.id)])),
    [sidebarGroups, getFeedsByGroup],
  );
  const totalUnread = getTotalUnreadCount();
  const starredCount = starredTotal;

  const allCount =
    articleFilter === "unread"
      ? totalUnread
      : articleFilter === "starred"
        ? starredCount
        : undefined;
  const allNodeKey = sidebarNodeKey.all();

  // Flat view of the rendered tree, top to bottom, for Shift+N / Shift+P etc.
  const nodes = useMemo<SidebarNode[]>(() => {
    const list: SidebarNode[] = [{ key: sidebarNodeKey.all(), kind: "all" }];

    for (const group of sidebarGroups) {
      list.push({
        key: sidebarNodeKey.group(group.id),
        kind: "group",
        groupId: group.id,
      });

      if (!collapsedIds.includes(group.id)) {
        for (const feed of getFeedsByGroup(group.id)) {
          list.push({
            key: sidebarNodeKey.feed(feed.id),
            kind: "feed",
            feedId: feed.id,
            groupId: group.id,
          });
        }
      }
    }

    return list;
  }, [collapsedIds, getFeedsByGroup, sidebarGroups]);

  useSidebarNavigation(nodes);

  if (isLoading && groups.length === 0) {
    return (
      <div className="flex-1 p-4">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-md bg-accent" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ScrollBox className="min-h-0 w-full min-w-0 flex-1">
      <div className="w-full min-w-0 p-2 space-y-0.5">
        {/* All feeds (unscoped list, current filter) */}
        <button
          data-sidebar-key={allNodeKey}
          onClick={() => {
            setFocusedKey(allNodeKey);
            selectAllFeeds();
          }}
          className={cn(
            "flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-[15px] leading-6 transition-colors",
            isTopLevelSelected
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50",
            ringKey === allNodeKey && "ring-2 ring-inset ring-ring",
          )}
        >
          <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            {t(allFeedsLabelKey(articleFilter))}
          </span>
          {typeof allCount === "number" && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {allCount}
            </span>
          )}
        </button>

        {/* Feeds header */}
        <div className="mt-2 flex items-center justify-between px-2 py-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t("search.group.feeds")}
          </span>
        </div>

        {/* Feed groups */}
        <div className="w-full min-w-0 space-y-0.5">
          {sidebarGroups.map((group) => (
            <FeedGroup
              key={group.id}
              groupId={group.id}
              name={group.name}
              feeds={feedsByGroup.get(group.id) ?? []}
            />
          ))}
        </div>
      </div>
    </ScrollBox>
  );
}
