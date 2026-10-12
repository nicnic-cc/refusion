import { useCallback, useMemo, useState } from "react";
import { createLazyFileRoute } from "@tanstack/react-router";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Download,
  Folder,
  ListFilter,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { WithTooltip } from "@/components/common/with-tooltip";
import { ContentHeader } from "@/components/layout/content-header";
import { SidebarTrigger } from "@/components/layout/sidebar-trigger";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { feedAPI, groupAPI } from "@/lib/api";
import type { Feed, Group } from "@/lib/api";
import { generateOPML, downloadFile } from "@/lib/opml";
import { DEFAULT_GROUP_ID } from "@/lib/groups";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useFeedLookup,
  useMoveFeedsToGroup,
  useRefreshFeeds,
} from "@/queries/feeds";
import { useSetFeedFilterEnabled } from "@/queries/feed-filters";
import { useDeleteGroup, useGroups, useUpdateGroup } from "@/queries/groups";
import { useUIStore } from "@/store";
import { FeedGroupCard } from "@/components/feed/feed-group-card";
import { FeedFilterDialogHost } from "@/components/feed/feed-filter-dialog-host";
import { GlobalFilterRow } from "@/components/feed/global-filter-row";
import { useIsMobile } from "@/hooks/use-mobile";
import { useReorder } from "@/hooks/use-reorder";

export const Route = createLazyFileRoute("/feeds")({
  component: FeedsPage,
});

type StatusFilter = "all" | "error" | "paused";

function FeedsPage() {
  const { t } = useI18n();
  const { data: groups = [] } = useGroups();
  const { feeds, getFeedsByGroup, isLoading: isFeedsLoading } = useFeedLookup();
  const updateGroupMutation = useUpdateGroup();
  const deleteGroupMutation = useDeleteGroup();
  const moveFeedsMutation = useMoveFeedsToGroup();
  const refreshFeedsMutation = useRefreshFeeds();

  const {
    setEditFeedOpen,
    setImportOpmlOpen,
    setAddFeedOpen,
    setAddGroupOpen,
  } = useUIStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isReordering, setIsReordering] = useState(false);
  const { moveGroup, moveFeed, flush } = useReorder();
  const [isExporting, setIsExporting] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(
    new Set(),
  );

  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");

  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [refreshConfirmOpen, setRefreshConfirmOpen] = useState(false);
  const [mobileErrorTooltipFeedId, setMobileErrorTooltipFeedId] = useState<
    number | null
  >(null);
  const isMobile = useIsMobile();

  const setFilterEnabled = useSetFeedFilterEnabled();
  const [filterFeedId, setFilterFeedId] = useState<number | null>(null);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const filterFeed = feeds.find((f) => f.id === filterFeedId);
  const togglingFilterFeedId = setFilterEnabled.isPending
    ? setFilterEnabled.variables.feedId
    : null;
  const openFilter = useCallback((feedId: number) => {
    setFilterFeedId(feedId);
    setFilterDialogOpen(true);
  }, []);
  const { mutate: mutateFilterEnabled } = setFilterEnabled;
  const toggleFilter = useCallback(
    (feedId: number, enabled: boolean) =>
      mutateFilterEnabled(
        { feedId, enabled },
        { onError: () => toast.error(t("feedFilter.toast.toggleFailed")) },
      ),
    [mutateFilterEnabled, t],
  );

  const statusFilterLabels: Record<StatusFilter, string> = {
    all: t("feeds.status.all"),
    error: t("feeds.status.error"),
    paused: t("feeds.status.paused"),
  };

  const isFiltering = searchQuery.trim() !== "" || statusFilter !== "all";

  const groupedFeeds = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    const matchesFeed = (feed: Feed) => {
      if (
        query &&
        !feed.name.toLowerCase().includes(query) &&
        !feed.link.toLowerCase().includes(query)
      ) {
        return false;
      }
      if (statusFilter === "error" && !feed.fetch_state.last_error)
        return false;
      if (statusFilter === "paused" && !feed.suspended) return false;
      return true;
    };

    return groups.map((group) => ({
      group,
      feeds: getFeedsByGroup(group.id).filter(matchesFeed),
    }));
  }, [groups, searchQuery, statusFilter, getFeedsByGroup]);

  const toggleReorder = () => {
    if (isReordering) {
      flush();
    } else {
      setSearchQuery("");
      setStatusFilter("all");
    }
    setIsReordering(!isReordering);
  };

  const toggleGroup = (groupId: number) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleRefreshAll = async () => {
    try {
      await refreshFeedsMutation.mutateAsync();
      toast.success(t("feeds.toast.refreshing"));
    } catch {
      toast.error(t("feeds.toast.refreshFailed"));
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const [groupsRes, feedsRes] = await Promise.all([
        groupAPI.list(),
        feedAPI.list(),
      ]);
      const opml = generateOPML(groupsRes.data, feedsRes.data);
      downloadFile(opml, "refusion-subscriptions.opml", "application/xml");
      toast.success(t("feeds.toast.exported"));
    } catch {
      toast.error(t("feeds.toast.exportFailed"));
    } finally {
      setIsExporting(false);
    }
  };

  const startEditingGroup = (group: Group) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  };

  const saveGroupName = async (group: Group) => {
    const name = editingGroupName.trim();
    setEditingGroupId(null);
    if (!name || name === group.name) return;

    try {
      await updateGroupMutation.mutateAsync({ id: group.id, name });
      toast.success(t("feeds.toast.renamed"));
    } catch {
      toast.error(t("feeds.toast.renameFailed"));
    }
  };

  const confirmDeleteGroup = async () => {
    if (!deletingGroup) return;

    setIsDeleting(true);
    try {
      await moveFeedsMutation.mutateAsync({
        fromGroupId: deletingGroup.id,
        toGroupId: 1,
      });
      await deleteGroupMutation.mutateAsync(deletingGroup.id);

      toast.success(t("feeds.toast.deleted"));
      setDeletingGroup(null);
    } catch {
      toast.error(t("feeds.toast.deleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  const visibleGroups = groupedFeeds.filter(
    ({ feeds: gf }) => gf.length > 0 || !isFiltering,
  );

  const totalVisible = groupedFeeds.reduce((sum, g) => sum + g.feeds.length, 0);
  const hasNoFeeds = !isFeedsLoading && feeds.length === 0;
  const deletingGroupMoveHint = useMemo(() => {
    if (!deletingGroup) {
      return "";
    }

    const count = feeds.filter((feed) => feed.group_id === deletingGroup.id).length;
    if (count === 0) {
      return "";
    }

    const target = groups.find((group) => group.id === DEFAULT_GROUP_ID);
    return t("feeds.deleteGroup.moveHint", {
      count,
      target: target?.name ?? t("feeds.deleteGroup.targetDefault"),
    });
  }, [deletingGroup, feeds, groups, t]);

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <ContentHeader>
          <div className="flex items-center gap-1">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold">{t("feeds.header")}</h1>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Rss className="h-4 w-4" />
            <span className="font-medium">
              {t("feeds.count", { count: feeds.length })}
            </span>
          </div>
        </ContentHeader>

        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("feeds.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isReordering}
                className="h-9 w-full pl-9 sm:w-[280px]"
                name="feed-search"
                autoComplete="off"
                aria-label={t("feeds.searchPlaceholder")}
              />
            </div>
            <DropdownMenu>
              <WithTooltip
                label={statusFilterLabels[statusFilter]}
                render={
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        className="shrink-0 gap-1.5"
                        disabled={isReordering}
                        aria-label={statusFilterLabels[statusFilter]}
                      />
                    }
                  />
                }
              >
                <ListFilter className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {statusFilterLabels[statusFilter]}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </WithTooltip>
              <DropdownMenuContent align="start">
                {(Object.keys(statusFilterLabels) as StatusFilter[]).map(
                  (key) => (
                    <DropdownMenuItem
                      key={key}
                      onClick={() => setStatusFilter(key)}
                    >
                      {statusFilterLabels[key]}
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button disabled={isReordering}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {t("common.add")}
                    <ChevronDown className="ml-1 h-3.5 w-3.5" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setAddFeedOpen(true)}>
                  <Rss className="mr-2 h-4 w-4" />
                  {t("feed.add.title")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAddGroupOpen(true)}>
                  <Folder className="mr-2 h-4 w-4" />
                  {t("group.add.title")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <WithTooltip
              label={
                isReordering ? t("feeds.reorder.done") : t("feeds.reorder.start")
              }
              render={
                <Button
                  variant={isReordering ? "default" : "outline"}
                  onClick={toggleReorder}
                  aria-pressed={isReordering}
                  aria-label={
                    isReordering
                      ? t("feeds.reorder.done")
                      : t("feeds.reorder.start")
                  }
                />
              }
            >
              {isReordering ? (
                <Check className="h-3.5 w-3.5 sm:mr-1.5" />
              ) : (
                <ArrowUpDown className="h-3.5 w-3.5 sm:mr-1.5" />
              )}
              <span className={cn(!isReordering && "hidden sm:inline")}>
                {isReordering ? t("feeds.reorder.done") : t("feeds.reorder.start")}
              </span>
            </WithTooltip>
            <WithTooltip
              label={t("feeds.refreshAll")}
              render={
                <Button
                  variant="outline"
                  onClick={() => setRefreshConfirmOpen(true)}
                  disabled={refreshFeedsMutation.isPending || isReordering}
                  aria-label={t("feeds.refreshAll")}
                />
              }
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5 sm:mr-1.5",
                  refreshFeedsMutation.isPending && "animate-spin",
                )}
              />
              <span className="hidden sm:inline">{t("feeds.refreshAll")}</span>
            </WithTooltip>
            <WithTooltip
              label={t("common.import")}
              render={
                <Button
                  variant="outline"
                  onClick={() => setImportOpmlOpen(true)}
                  disabled={isReordering}
                  aria-label={t("common.import")}
                />
              }
            >
              <Upload className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">{t("common.import")}</span>
            </WithTooltip>
            <WithTooltip
              label={isExporting ? t("common.exporting") : t("feeds.exportButton")}
              render={
                <Button
                  variant="outline"
                  onClick={handleExport}
                  disabled={isExporting || isReordering}
                  aria-label={
                    isExporting ? t("common.exporting") : t("feeds.exportButton")
                  }
                />
              }
            >
              <Download className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">
                {isExporting ? t("common.exporting") : t("feeds.exportButton")}
              </span>
            </WithTooltip>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-4 sm:p-6">
            {hasNoFeeds ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {t("feeds.empty")}
              </div>
            ) : (
              <>
                <GlobalFilterRow />
                {visibleGroups.map(({ group, feeds: groupFeeds }, groupIndex) => {
                  const isCollapsed = collapsedGroups.has(group.id);
                  const isEditing = editingGroupId === group.id;

                  return (
                    <FeedGroupCard
                      key={group.id}
                      group={group}
                      togglingFilterFeedId={togglingFilterFeedId}
                      onOpenFilter={openFilter}
                      onToggleFilter={toggleFilter}
                      reorder={
                        isReordering
                          ? {
                              groupIndex,
                              groupCount: visibleGroups.length,
                              onMoveGroup: (g, move) => moveGroup(g.id, move),
                              onMoveFeed: (f, move) =>
                                moveFeed(group.id, f.id, move),
                            }
                          : undefined
                      }
                      groupFeeds={groupFeeds}
                      isCollapsed={isCollapsed}
                      isEditing={isEditing}
                      editingGroupName={editingGroupName}
                      isMobile={isMobile}
                      mobileErrorTooltipFeedId={mobileErrorTooltipFeedId}
                      onToggleGroup={toggleGroup}
                      onStartEditingGroup={startEditingGroup}
                      onChangeEditingGroupName={setEditingGroupName}
                      onSaveGroupName={(targetGroup) => {
                        void saveGroupName(targetGroup);
                      }}
                      onCancelEditingGroup={() => setEditingGroupId(null)}
                      onOpenAddFeed={() => setAddFeedOpen(true)}
                      onOpenDeleteGroup={setDeletingGroup}
                      onOpenEditFeed={(feed) => setEditFeedOpen(true, feed)}
                      onChangeMobileErrorTooltipFeedId={setMobileErrorTooltipFeedId}
                      t={t}
                    />
                  );
                })}

                {visibleGroups.length === 0 && (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    {t("feeds.noMatch")}
                  </div>
                )}

                {isFiltering &&
                  visibleGroups.length > 0 &&
                  totalVisible === 0 && (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      {t("feeds.noMatch")}
                    </div>
                  )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {filterFeed && (
        <FeedFilterDialogHost
          key={filterFeed.id}
          feed={filterFeed}
          open={filterDialogOpen}
          onOpenChange={setFilterDialogOpen}
        />
      )}

      <Dialog
        open={deletingGroup !== null}
        onOpenChange={(open) => !open && setDeletingGroup(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("feeds.deleteGroup.title")}</DialogTitle>
            <DialogDescription>
              {t("feeds.deleteGroup.description", {
                name: deletingGroup?.name ?? "",
              })}
              {deletingGroupMoveHint ? ` ${deletingGroupMoveHint}` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingGroup(null)}
              disabled={isDeleting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteGroup}
              disabled={isDeleting}
            >
              {isDeleting ? t("common.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={refreshConfirmOpen} onOpenChange={setRefreshConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("feeds.refreshDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("feeds.refreshDialog.description", { count: feeds.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRefreshConfirmOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                setRefreshConfirmOpen(false);
                handleRefreshAll();
              }}
            >
              {t("common.refresh")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
