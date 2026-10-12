import { Check, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SharedTooltipTrigger } from "@/components/common/shared-tooltip";
import { articleFontFamilies } from "@/hooks/use-article-appearance-styles";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/messages/en";
import { cn } from "@/lib/utils";
import {
  articleFontOptions,
  articleScaleMax,
  articleScaleMin,
  articleScaleStep,
  useArticleAppearanceStore,
  type ArticleFont,
} from "@/store/article-appearance";

const fontLabels: Record<ArticleFont, TranslationKey> = {
  sans: "article.appearance.sans",
  serif: "article.appearance.serif",
  mono: "article.appearance.mono",
};

export function ArticleAppearance() {
  const { t } = useI18n();
  const font = useArticleAppearanceStore((s) => s.font);
  const scale = useArticleAppearanceStore((s) => s.scale);
  const setFont = useArticleAppearanceStore((s) => s.setFont);
  const setScale = useArticleAppearanceStore((s) => s.setScale);
  const label = t("article.action.appearance");

  return (
    <Popover>
      <SharedTooltipTrigger
        tip={label}
        render={
          <PopoverTrigger
            render={<Button variant="outline" size="icon-sm" aria-label={label} />}
          />
        }
      >
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
      </SharedTooltipTrigger>
      <PopoverContent align="start" className="w-56 gap-3 p-2">
        <div className="flex flex-col gap-0.5">
          {articleFontOptions.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={font === option}
              onClick={() => setFont(option)}
              // Sans has no override; preview it in the article's own font.
              style={{
                fontFamily: articleFontFamilies[option] ?? "var(--font-geist)",
              }}
              className={cn(
                "flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                font === option && "bg-accent",
              )}
            >
              {t(fontLabels[option])}
              {font === option && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("article.appearance.smaller")}
            disabled={scale <= articleScaleMin}
            onClick={() => setScale(scale - articleScaleStep)}
          >
            <span className="text-xs font-medium">A</span>
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            {scale}%
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("article.appearance.larger")}
            disabled={scale >= articleScaleMax}
            onClick={() => setScale(scale + articleScaleStep)}
          >
            <span className="text-lg font-medium leading-none">A</span>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
