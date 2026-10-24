import { useState } from "react";
import { Filter } from "lucide-react";
import { toast } from "sonner";
import { WithTooltip } from "@/components/common/with-tooltip";
import { FilterDialog } from "@/components/feed/filter-dialog";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useGlobalFilter,
  useSetGlobalFilterEnabled,
} from "@/queries/global-filter";

export function GlobalFilterRow() {
  const { t } = useI18n();
  const { filter } = useGlobalFilter();
  const setEnabled = useSetGlobalFilterEnabled();
  const [open, setOpen] = useState(false);
  const dim = !filter || !filter.enabled;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/50 px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {t("globalFilter.title")}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {t("globalFilter.description")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <WithTooltip
          label={t(
            filter ? "globalFilter.tooltip.edit" : "globalFilter.tooltip.add",
          )}
          render={
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn(
                "flex items-center gap-1 rounded p-1 text-xs hover:bg-accent max-md:min-h-11 max-md:min-w-11 max-md:justify-center",
                dim ? "text-muted-foreground/70" : "text-foreground",
              )}
              aria-label={t("globalFilter.title")}
            />
          }
        >
          <Filter className="h-3.5 w-3.5 shrink-0" />
          {filter && (
            <span className="hidden sm:inline">
              {t("feedFilter.action.remove")}
            </span>
          )}
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
                disabled={setEnabled.isPending}
                aria-label={t("feedFilter.enabled")}
                onCheckedChange={(enabled) =>
                  setEnabled.mutate(enabled, {
                    onError: () =>
                      toast.error(t("feedFilter.toast.toggleFailed")),
                  })
                }
              />
            }
          />
        )}
      </div>
      <FilterDialog
        target={{ kind: "global" }}
        filter={filter}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
