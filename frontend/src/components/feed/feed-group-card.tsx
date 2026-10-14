import { AlertCircle, ChevronDown, ChevronRight, Folder, Pause, Pencil, Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { WithTooltip } from "@/components/common/with-tooltip";
import { FeedFavicon } from "@/components/feed/feed-favicon";
import { FeedFilterControl } from "@/components/feed/feed-filter-control";
import { ReorderControls } from "@/components/feed/reorder-controls";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getFaviconUrl } from "@/lib/api/favicon";
import { getFeedErrorPreview } from "@/lib/feed-error";
import { DEFAULT_GROUP_ID } from "@/lib/groups";
import type { TranslationKey } from "@/lib/i18n";
import type { Move } from "@/lib/reorder";
import { cn, formatDate } from "@/lib/utils";
import type { Feed, Group } from "@/lib/api";

export interface FeedGroupReorder {
  groupIndex: number;
  groupCount: number;
  onMoveGroup: (group: Group, move: Move) => void;
  onMoveFeed: (feed: Feed, move: Move) => void;
}

interface FeedGroupCardProps {
  group: Group;
  togglingFilterFeedIds: ReadonlySet<number>;
  onOpenFilter: (feedId: number) => void;
  onToggleFilter: (feedId: number, enabled: boolean) => void;
  reorder?: FeedGroupReorder;
  groupFeeds: Feed[];
  isCollapsed: boolean;
  isEditing: boolean;
  editingGroupName: string;
  isMobile: boolean;
  mobileErrorTooltipFeedId: number | null;
  onToggleGroup: (groupId: number) => void;
  onStartEditingGroup: (group: Group) => void;
  onChangeEditingGroupName: (value: string) => void;
  onSaveGroupName: (group: Group) => void;
  onCancelEditingGroup: () => void;
  onOpenAddFeed: () => void;
  onOpenDeleteGroup: (group: Group) => void;
  onOpenEditFeed: (feed: Feed) => void;
  onChangeMobileErrorTooltipFeedId: Dispatch<SetStateAction<number | null>>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function FeedGroupCard({
  group,
  togglingFilterFeedIds,
  onOpenFilter,
  onToggleFilter,
  reorder,
  groupFeeds,
  isCollapsed,
  isEditing,
  editingGroupName,
  isMobile,
  mobileErrorTooltipFeedId,
  onToggleGroup,
  onStartEditingGroup,
  onChangeEditingGroupName,
  onSaveGroupName,
  onCancelEditingGroup,
  onOpenAddFeed,
  onOpenDeleteGroup,
  onOpenEditFeed,
  onChangeMobileErrorTooltipFeedId,
  t,
}: FeedGroupCardProps) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div
        className={cn(
          "group/header flex items-center justify-between bg-muted/50 px-3.5 py-2.5",
          isCollapsed ? "rounded-lg" : "rounded-t-lg",
        )}
      >
        {isEditing ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <Folder
              className={cn(
                "h-4 w-4",
                isCollapsed && "text-muted-foreground",
              )}
            />
            <Input
              value={editingGroupName}
              onChange={(e) => onChangeEditingGroupName(e.target.value)}
              onBlur={() => onSaveGroupName(group)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing)
                  onSaveGroupName(group);
                if (e.key === "Escape") onCancelEditingGroup();
              }}
              className="h-7 w-40 px-2 text-sm"
              aria-label={t("group.add.placeholder")}
              autoComplete="off"
              data-1p-ignore
              autoFocus={!isMobile}
            />
            <span
              className={cn(
                "rounded-full bg-muted px-2 py-0.5 text-[11px]",
                isCollapsed
                  ? "font-medium text-muted-foreground"
                  : "font-semibold text-muted-foreground",
              )}
            >
              {groupFeeds.length}
            </span>
          </div>
        ) : (
          <WithTooltip
            label={t(
              isCollapsed ? "feeds.tooltip.expand" : "feeds.tooltip.collapse",
            )}
            render={
              <button
                type="button"
                onClick={() => onToggleGroup(group.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left max-md:min-h-11"
                aria-expanded={!isCollapsed}
                aria-label={`Toggle group ${group.name}`}
              />
            }
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <Folder
              className={cn(
                "h-4 w-4",
                isCollapsed && "text-muted-foreground",
              )}
            />
            <span
              className={cn(
                "text-sm",
                isCollapsed ? "font-medium" : "font-semibold",
              )}
            >
              {group.name}
            </span>
            <span
              className={cn(
                "rounded-full bg-muted px-2 py-0.5 text-[11px]",
                isCollapsed
                  ? "font-medium text-muted-foreground"
                  : "font-semibold text-muted-foreground",
              )}
            >
              {groupFeeds.length}
            </span>
          </WithTooltip>
        )}
        {reorder && (
          <ReorderControls
            index={reorder.groupIndex}
            count={reorder.groupCount}
            onMove={(move) => reorder.onMoveGroup(group, move)}
            t={t}
          />
        )}
        {!reorder && (
          <div className="flex items-center gap-1 max-md:gap-0 sm:opacity-0 sm:transition-opacity sm:group-hover/header:opacity-100">
            <WithTooltip
              label={t("feeds.tooltip.addFeed")}
              render={
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAddFeed();
                  }}
                  className="rounded p-1 hover:bg-accent max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center"
                  aria-label={t("feed.add.button")}
                />
              }
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            </WithTooltip>
            <WithTooltip
              label={t("feeds.renameGroup")}
              render={
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartEditingGroup(group);
                  }}
                  className="rounded p-1 hover:bg-accent max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center"
                  aria-label={t("feeds.renameGroup")}
                />
              }
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </WithTooltip>
            {group.id !== DEFAULT_GROUP_ID && (
              <WithTooltip
                label={t("feeds.deleteGroup.title")}
                render={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDeleteGroup(group);
                    }}
                    className="rounded p-1 hover:bg-accent max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center"
                    aria-label={t("feeds.deleteGroup.title")}
                  />
                }
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </WithTooltip>
            )}
          </div>
        )}
      </div>

      {!isCollapsed && groupFeeds.length > 0 && (
        <div>
          {groupFeeds.map((feed, index) => (
            <div
              key={feed.id}
              className={cn(
                "flex items-center justify-between py-2.5 pl-8 pr-3.5 transition-colors hover:bg-accent/30 sm:pl-11",
                index < groupFeeds.length - 1 && "border-b border-border/50",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <FeedFavicon
                  src={getFaviconUrl(feed.link, feed.site_url)}
                  className="h-5 w-5"
                />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{feed.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {getDomain(feed.link)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 max-sm:gap-0 sm:gap-2.5">
                {feed.fetch_state.last_error && (
                  <Tooltip
                    open={
                      isMobile
                        ? mobileErrorTooltipFeedId === feed.id
                        : undefined
                    }
                    onOpenChange={(open) => {
                      if (!isMobile || open) return;
                      onChangeMobileErrorTooltipFeedId((current) =>
                        current === feed.id ? null : current,
                      );
                    }}
                  >
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          aria-label={t("feeds.status.error")}
                          onClick={() => {
                            if (!isMobile) return;
                            onChangeMobileErrorTooltipFeedId((current) =>
                              current === feed.id ? null : feed.id,
                            );
                          }}
                          className="flex items-center gap-1 rounded-sm text-xs text-destructive max-md:min-h-11 max-md:min-w-11 max-md:justify-center"
                        />
                      }
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span className="hidden max-w-56 truncate font-medium sm:inline">
                        {getFeedErrorPreview(feed.fetch_state.last_error)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-sm whitespace-normal break-words"
                    >
                      {feed.fetch_state.last_error.trim()}
                    </TooltipContent>
                  </Tooltip>
                )}
                {feed.suspended && (
                  <Pause className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {t("feeds.itemCount", {
                    count: feed.item_count,
                  })}{" "}
                  ·{" "}
                  {feed.fetch_state.last_checked_at > 0
                    ? formatDate(feed.fetch_state.last_checked_at)
                    : t("common.unknown")}
                </span>
                {!reorder && (
                  <>
                    <FeedFilterControl
                      feedId={feed.id}
                      toggling={togglingFilterFeedIds.has(feed.id)}
                      onOpen={onOpenFilter}
                      onToggle={onToggleFilter}
                    />
                    <WithTooltip
                      label={t("feeds.tooltip.editFeed")}
                      render={
                        <button
                          type="button"
                          onClick={() => onOpenEditFeed(feed)}
                          className="rounded p-1 hover:bg-accent max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center"
                          aria-label={t("feed.edit.title")}
                        />
                      }
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </WithTooltip>
                  </>
                )}
                {reorder && (
                  <ReorderControls
                    index={index}
                    count={groupFeeds.length}
                    onMove={(move) => reorder.onMoveFeed(feed, move)}
                    t={t}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
