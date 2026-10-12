import { useEffect, useState } from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { Inbox, Layers, Star } from "lucide-react";
import { SharedTooltipTrigger } from "@/components/common/shared-tooltip";
import type { ArticleFilter } from "@/hooks/use-url-state";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const options = [
  { value: "all", icon: Layers, labelKey: "article.filter.all" },
  { value: "unread", icon: Inbox, labelKey: "article.filter.unread" },
  { value: "starred", icon: Star, labelKey: "article.filter.starred" },
] as const;

// Icon-only 3-way switch: one thumb glides behind the active icon.
export function ArticleFilterSwitch({
  value,
  onValueChange,
}: {
  value: ArticleFilter;
  onValueChange: (value: ArticleFilter) => void;
}) {
  const { t } = useI18n();

  // The indicator is laid out after mount; enabling the transition only after
  // that keeps the thumb from sliding in from the left on first paint.
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setAnimate(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={(v) => onValueChange(v as ArticleFilter)}
    >
      <TabsPrimitive.List className="relative inline-flex h-7 items-center rounded-lg bg-muted p-0.5">
        <TabsPrimitive.Indicator
          className={cn(
            "absolute top-(--active-tab-top) left-(--active-tab-left) h-(--active-tab-height) w-(--active-tab-width) rounded-md bg-background shadow-sm dark:border dark:border-input dark:bg-input/30",
            animate
              ? "transition-[left,width] duration-200 ease-out motion-reduce:transition-none"
              : "transition-none",
          )}
        />
        {options.map(({ value: optionValue, icon: Icon, labelKey }) => {
          const label = t(labelKey);
          return (
            <SharedTooltipTrigger
              key={optionValue}
              tip={label}
              render={
                <TabsPrimitive.Tab
                  value={optionValue}
                  aria-label={label}
                  className="relative z-10 inline-flex h-full w-[30px] items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-active:text-foreground"
                />
              }
            >
              <Icon className="size-4" aria-hidden="true" />
            </SharedTooltipTrigger>
          );
        })}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}
