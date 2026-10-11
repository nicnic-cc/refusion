import { useState } from "react";
import { Filter } from "lucide-react";
import { toast } from "sonner";
import { FilterDialog } from "@/components/feed/filter-dialog";
import { Switch } from "@/components/ui/switch";
import type { Feed } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useFeedFilters,
  useSetFeedFilterEnabled,
} from "@/queries/feed-filters";

export function FeedFilterControl({
  feed,
  className,
}: {
  feed: Feed;
  className?: string;
}) {
  const { t } = useI18n();
  const { byFeedId } = useFeedFilters();
  const setEnabled = useSetFeedFilterEnabled();
  const [open, setOpen] = useState(false);
  const filter = byFeedId.get(feed.id);

  const label = filter
    ? t(
        filter.action === "remove"
          ? "feedFilter.button.remove"
          : "feedFilter.button.keep",
        { count: filter.hidden_count },
      )
    : t("feedFilter.button.add");
  const dim = !filter || !filter.enabled;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-1 rounded p-1 text-xs hover:bg-accent",
          dim ? "text-muted-foreground/70" : "text-foreground",
        )}
        aria-label={t("feedFilter.title")}
        title={label}
      >
        <Filter className="h-3.5 w-3.5 shrink-0" />
        {filter && <span className="hidden sm:inline">{label}</span>}
      </button>
      {filter && (
        <Switch
          size="sm"
          checked={filter.enabled}
          disabled={setEnabled.isPending}
          aria-label={t("feedFilter.enabled")}
          onCheckedChange={(enabled) =>
            setEnabled.mutate(
              { feedId: feed.id, enabled },
              { onError: () => toast.error(t("feedFilter.toast.toggleFailed")) },
            )
          }
        />
      )}
      <FilterDialog
        feed={feed}
        filter={filter}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
