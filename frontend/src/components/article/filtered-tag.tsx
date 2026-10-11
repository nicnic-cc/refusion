import { useI18n } from "@/lib/i18n";

export function FilteredTag({ global }: { global: boolean }) {
  const { t } = useI18n();
  return (
    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      {t(global ? "article.filteredTag.global" : "article.filteredTag.feed")}
    </span>
  );
}
