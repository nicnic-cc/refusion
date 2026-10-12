import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ArticleView } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export function DefaultViewSelect({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: ArticleView;
  onChange: (view: ArticleView) => void;
}) {
  const { t } = useI18n();
  const items: { value: ArticleView; label: string }[] = [
    { value: "feed", label: t("feed.add.defaultViewFeed") },
    { value: "full", label: t("feed.add.defaultViewFull") },
    { value: "web", label: t("feed.add.defaultViewWeb") },
  ];
  const labelId = `${idPrefix}-default-view-label`;

  return (
    <div className="space-y-2">
      <label className="block text-[13px] font-medium" id={labelId}>
        {t("feed.add.defaultViewLabel")}
      </label>
      <Select
        items={items}
        value={value}
        onValueChange={(v) => v && onChange(v as ArticleView)}
      >
        <SelectTrigger className="h-10" aria-labelledby={labelId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {t("feed.add.defaultViewDescription")}
      </p>
    </div>
  );
}
