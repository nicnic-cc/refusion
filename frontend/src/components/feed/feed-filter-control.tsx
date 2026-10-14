import { memo } from "react";
import { Filter, Globe } from "lucide-react";
import { WithTooltip } from "@/components/common/with-tooltip";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useFeedFilter, useFeedHiddenCounts } from "@/queries/feed-filters";

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
  const counts = useFeedHiddenCounts(feedId);

  const label = filter
    ? [
        t(
          filter.action === "remove"
            ? "feedFilter.button.remove"
            : "feedFilter.button.keep",
        ),
        counts?.feed
          ? t("feedFilter.button.hidden", { count: counts.feed })
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : t("feedFilter.button.add");
  const buttonTip = [
    t(filter ? "feedFilter.tooltip.edit" : "feedFilter.tooltip.add"),
    counts?.feed
      ? t("feedFilter.button.hidden", { count: counts.feed })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const globalLabel = counts?.global
    ? t("feedFilter.button.hiddenByGlobal", { count: counts.global })
    : null;
  const dim = !filter || !filter.enabled;

  return (
    <div className={cn("flex items-center gap-1.5 max-md:gap-0", className)}>
      {/* Outside the button: the global count is not this feed's filter. */}
      {globalLabel && (
        <WithTooltip
          label={t("feedFilter.tooltip.hiddenByGlobal")}
          render={
            <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex" />
          }
        >
          <Globe className="h-3 w-3 shrink-0" />
          {globalLabel}
        </WithTooltip>
      )}
      <WithTooltip
        label={buttonTip}
        render={
          <button
            type="button"
            onClick={() => onOpen(feedId)}
            className={cn(
              "flex items-center gap-1 rounded p-1 text-xs hover:bg-accent max-md:min-h-11 max-md:min-w-11 max-md:justify-center",
              dim ? "text-muted-foreground/70" : "text-foreground",
            )}
            aria-label={t("feedFilter.title")}
          />
        }
      >
        <Filter className="h-3.5 w-3.5 shrink-0" />
        {filter && <span className="hidden sm:inline">{label}</span>}
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
              onCheckedChange={(enabled) => onToggle(feedId, enabled)}
            />
          }
        />
      )}
    </div>
  );
});
