import { memo, useState } from "react";
import { Eye, Filter, Folder, Globe } from "lucide-react";
import { toast } from "sonner";
import { WithTooltip } from "@/components/common/with-tooltip";
import { FilterDialog } from "@/components/feed/filter-dialog";
import { Switch } from "@/components/ui/switch";
import type { FilterAction, Group } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useFeedFilter,
  useFeedHiddenCounts,
  useGroupFilter,
  useSetGroupFilterEnabled,
} from "@/queries/feed-filters";

interface FilterControlProps {
  filter?: { action: FilterAction; enabled: boolean };
  tooltip: string;
  ariaLabel: string;
  toggling: boolean;
  onOpen: () => void;
  onToggle: (enabled: boolean) => void;
  className?: string;
}

// The button and switch shared by feed rows and folder cards. It shows only
// what is set here; what the filters hide is in FeedArticleCounts.
function FilterControl({
  filter,
  tooltip,
  ariaLabel,
  toggling,
  onOpen,
  onToggle,
  className,
}: FilterControlProps) {
  const { t } = useI18n();
  const label = filter
    ? t(
        filter.action === "remove"
          ? "feedFilter.button.remove"
          : "feedFilter.button.keep",
      )
    : null;
  const dim = !filter || !filter.enabled;

  return (
    <div className={cn("flex items-center gap-1.5 max-md:gap-0", className)}>
      <WithTooltip
        label={tooltip}
        render={
          <button
            type="button"
            onClick={onOpen}
            className={cn(
              "flex items-center gap-1 rounded p-1 text-xs hover:bg-accent max-md:min-h-11 max-md:min-w-11 max-md:justify-center",
              dim ? "text-muted-foreground/70" : "text-foreground",
            )}
            aria-label={ariaLabel}
          />
        }
      >
        <Filter className="h-3.5 w-3.5 shrink-0" />
        {label && <span className="hidden sm:inline">{label}</span>}
      </WithTooltip>
      {filter && (
        <WithTooltip
          label={t(
            filter.enabled
              ? "feedFilter.tooltip.turnOff"
              : "feedFilter.tooltip.turnOn",
          )}
          render={
            <Switch
              size="sm"
              checked={filter.enabled}
              disabled={toggling}
              aria-label={t("feedFilter.enabled")}
              onCheckedChange={onToggle}
            />
          }
        />
      )}
    </div>
  );
}

// Articles shown in a feed row (eye icon), then an icon and count per filter that hides
// articles in it, broadest first. Each count's tooltip names its filter.
export const FeedArticleCounts = memo(function FeedArticleCounts({
  feedId,
  shown,
}: {
  feedId: number;
  shown: number;
}) {
  const { t } = useI18n();
  const counts = useFeedHiddenCounts(feedId);
  const sources = counts
    ? [
        { count: counts.global, label: t("article.filteredTag.global"), Icon: Globe },
        { count: counts.group, label: t("article.filteredTag.group"), Icon: Folder },
        { count: counts.feed, label: t("feedFilter.hiddenBy.feed"), Icon: Filter },
      ].filter((source) => source.count > 0)
    : [];
  if (sources.length === 0) return <>{t("feeds.itemCount", { count: shown })}</>;

  return (
    <>
      <WithTooltip
        label={t("feeds.shownCount", { count: shown })}
        render={<span className="inline-flex items-center gap-1 align-bottom" />}
      >
        <Eye className="h-3 w-3 shrink-0" aria-hidden />
        {shown}
      </WithTooltip>
      <span className="mx-1.5">·</span>
      <span className="inline-flex items-center gap-2 align-bottom">
        {sources.map(({ count, label, Icon }) => (
          <WithTooltip
            key={label}
            label={`${label} · ${t("feedFilter.button.hidden", { count })}`}
            render={<span className="inline-flex items-center gap-1" />}
          >
            <Icon className="h-3 w-3 shrink-0" aria-hidden />
            {count}
          </WithTooltip>
        ))}
      </span>
    </>
  );
});

interface FeedFilterControlProps {
  feedId: number;
  toggling: boolean;
  onOpen: (feedId: number) => void;
  onToggle: (feedId: number, enabled: boolean) => void;
  className?: string;
}

// The page owns the dialog and the toggle mutation. Each row subscribes only
// to its own filter and counts, so arriving data redraws rows, not the page.
export const FeedFilterControl = memo(function FeedFilterControl({
  feedId,
  toggling,
  onOpen,
  onToggle,
  className,
}: FeedFilterControlProps) {
  const { t } = useI18n();
  const filter = useFeedFilter(feedId);

  return (
    <FilterControl
      filter={filter}
      tooltip={t(filter ? "feedFilter.tooltip.edit" : "feedFilter.tooltip.add")}
      ariaLabel={t("feedFilter.title")}
      toggling={toggling}
      onOpen={() => onOpen(feedId)}
      onToggle={(enabled) => onToggle(feedId, enabled)}
      className={className}
    />
  );
});

// A folder card owns its dialog and switch: there are few folders, so the
// page needs no shared state for them. No count: the feed rows show theirs.
export function GroupFilterControl({
  group,
  className,
}: {
  group: Group;
  className?: string;
}) {
  const { t } = useI18n();
  const filter = useGroupFilter(group.id);
  const setEnabled = useSetGroupFilterEnabled();
  const [open, setOpen] = useState(false);

  return (
    <>
      <FilterControl
        filter={filter}
        tooltip={t(
          filter ? "groupFilter.tooltip.edit" : "groupFilter.tooltip.add",
        )}
        ariaLabel={t("groupFilter.title")}
        toggling={setEnabled.isPending}
        onOpen={() => setOpen(true)}
        onToggle={(enabled) =>
          setEnabled.mutate(
            { groupId: group.id, enabled },
            { onError: () => toast.error(t("feedFilter.toast.toggleFailed")) },
          )
        }
        className={className}
      />
      <FilterDialog
        target={{ kind: "group", group }}
        filter={filter}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
