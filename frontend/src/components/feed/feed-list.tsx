import { useMemo, useState } from "react";
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
import { getVisibleFeedIds } from "@/lib/sidebar-visible";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { sidebarNodeKey, useSidebarNavStore, type SidebarNode } from "@/store";
import { useCollapsedGroupsStore } from "@/store/collapsed-groups";
import { usePendingFeedReadsStore } from "@/store/pending-feed-reads";
import { FeedGroup } from "./feed-group";

const EMPTY_IDS: ReadonlySet<number> = new Set();

export function FeedList() {
  const { t } = useI18n();
  const { data: groups = [], isLoading } = useGroups();
  const { feeds, getFeedsByGroup } = useFeedLookup();
  const { getTotalUnreadCount } = useUnreadCounts();
  const { total: starredTotal, bookmarks } = useBookmarkLookup();
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
  // Feeds waiting out an undo window already count as read.
  const pendingReads = usePendingFeedReadsStore((s) => s.pending);
  const unreadByGroup = useMemo(
    () =>
      new Map(
        [...feedsByGroup].map(([id, groupFeeds]) => [
          id,
          groupFeeds.reduce(
            (sum, f) => sum + (pendingReads[f.id] ? 0 : f.unread_count || 0),
            0,
          ),
        ]),
      ),
    [feedsByGroup, pendingReads],
  );

  const starredFeedIds = useMemo(
    () =>
      new Set(
        bookmarks.flatMap((b) => (b.feed_id === null ? [] : [b.feed_id])),
      ),
    [bookmarks],
  );
  // Feeds shown since this view was entered stay, so marking articles read
  // doesn't make rows vanish under the reader.
  const viewKey = `${articleFilter}|${selectedFeedId}|${selectedGroupId}`;
  const [sticky, setSticky] = useState({
    key: viewKey,
    ids: new Set<number>(),
  });
  const stickyIds = sticky.key === viewKey ? sticky.ids : EMPTY_IDS;
  const visibleFeedIds = useMemo(
    () =>
      getVisibleFeedIds({
        feeds,
        filter: articleFilter,
        starredFeedIds,
        selectedFeedId,
        selectedGroupId,
        stickyIds,
      }),
    [
      feeds,
      articleFilter,
      starredFeedIds,
      selectedFeedId,
      selectedGroupId,
      stickyIds,
    ],
  );
  // Adjusting state during render re-renders at once and settles in one pass.
  if (
    sticky.key !== viewKey ||
    [...visibleFeedIds].some((id) => !sticky.ids.has(id))
  ) {
    setSticky({
      key: viewKey,
      ids: new Set([...stickyIds, ...visibleFeedIds]),
    });
  }

  const visibleFeedsByGroup = useMemo(
    () =>
      new Map(
        [...feedsByGroup].map(([id, groupFeeds]) => {
          const shown = groupFeeds.filter((f) => visibleFeedIds.has(f.id));
          // Same array when nothing is hidden, so memoized groups skip re-render.
          return [id, shown.length === groupFeeds.length ? groupFeeds : shown];
        }),
      ),
    [feedsByGroup, visibleFeedIds],
  );
  const visibleGroups = useMemo(
    () =>
      sidebarGroups.filter(
        (g) =>
          articleFilter === "all" ||
          g.id === selectedGroupId ||
          (visibleFeedsByGroup.get(g.id)?.length ?? 0) > 0,
      ),
    [articleFilter, sidebarGroups, visibleFeedsByGroup, selectedGroupId],
  );

  const totalUnread = feeds.reduce(
    (sum, f) => (pendingReads[f.id] ? sum - (f.unread_count ?? 0) : sum),
    getTotalUnreadCount(),
  );
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

    for (const group of visibleGroups) {
      list.push({
        key: sidebarNodeKey.group(group.id),
        kind: "group",
        groupId: group.id,
      });

      if (!collapsedIds.includes(group.id)) {
        for (const feed of visibleFeedsByGroup.get(group.id) ?? []) {
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
  }, [collapsedIds, visibleFeedsByGroup, visibleGroups]);

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
          {visibleGroups.map((group) => (
            <FeedGroup
              key={group.id}
              groupId={group.id}
              name={group.name}
              feeds={visibleFeedsByGroup.get(group.id) ?? []}
              unreadCount={unreadByGroup.get(group.id) ?? 0}
            />
          ))}
        </div>
      </div>
    </ScrollBox>
  );
}
