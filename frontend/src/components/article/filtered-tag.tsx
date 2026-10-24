import type { Item } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

// Names the filter blamed for hiding the article: the most specific one.
export function FilteredTag({
  article,
}: {
  article: Pick<Item, "filtered_group" | "filtered_global">;
}) {
  const { t } = useI18n();
  const key = article.filtered_group
    ? "article.filteredTag.group"
    : article.filtered_global
      ? "article.filteredTag.global"
      : "article.filteredTag.feed";
  return (
    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      {t(key)}
    </span>
  );
}
