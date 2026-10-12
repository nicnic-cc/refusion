import { useMemo } from "react";
import { useLocation } from "@tanstack/react-router";
import { Inbox, Layers, Star } from "lucide-react";
import { ScrollBox } from "@/components/scroll-box";
import { isArticleFilter, type ArticleFilter } from "@/lib/article-filter";
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

// Must match the order of topFilters below.
const sidebarFilterValues: ArticleFilter[] = ["unread", "starred", "all"];

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
    selectTopLevelFilter,
  } = useUrlState();
  const { pathname } = useLocation();
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
  const totalUnread = getTotalUnreadCount();
  const starredCount = starredTotal;

  const topFilters: Array<{
    value: "all" | "unread" | "starred";
    label: string;
    count?: number;
    icon: typeof Inbox;
  }> = [
    {
      value: "unread",
      label: t("article.filter.unread"),
      count: totalUnread,
      icon: Inbox,
    },
    {
      value: "starred",
      label: t("article.filter.starred"),
      count: starredCount,
      icon: Star,
    },
    {
      value: "all",
      label: t("article.filter.all"),
      icon: Layers,
    },
  ];

  // Flat view of the rendered tree, top to bottom, for Shift+N / Shift+P etc.
  const nodes = useMemo<SidebarNode[]>(() => {
    const list: SidebarNode[] = sidebarFilterValues.map((filter) => ({
      key: sidebarNodeKey.filter(filter),
      kind: "filter",
      filter,
    }));

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
        {/* Top-level filters */}
        <div className="space-y-0.5">
          {topFilters.map(({ value, label, count, icon: Icon }) => {
            const nodeKey = sidebarNodeKey.filter(value);

            return (
              <button
                key={value}
                data-sidebar-key={nodeKey}
                onClick={() => {
                  setFocusedKey(nodeKey);
                  selectTopLevelFilter(value);
                }}
                className={cn(
                  "flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-[15px] leading-6 transition-colors",
                  isTopLevelSelected && articleFilter === value
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50",
                  ringKey === nodeKey && "ring-2 ring-inset ring-ring",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">{label}</span>
                {typeof count === "number" && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Feeds header */}
        <div className="mt-2 flex items-center justify-between px-2 py-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t("search.group.feeds")}
          </span>
        </div>

        {/* Feed groups */}
        <div className="w-full min-w-0 space-y-0.5">
          {sidebarGroups.map((group) => {
            const groupFeeds = getFeedsByGroup(group.id);

            return (
              <FeedGroup
                key={group.id}
                groupId={group.id}
                name={group.name}
                feeds={groupFeeds}
              />
            );
          })}
        </div>
      </div>
    </ScrollBox>
  );
}
