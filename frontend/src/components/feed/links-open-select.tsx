import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";

export function LinksOpenSelect({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: boolean;
  onChange: (openPermalink: boolean) => void;
}) {
  const { t } = useI18n();
  const items = [
    { value: "linked", label: t("feed.add.linksOpenLinked") },
    { value: "own", label: t("feed.add.linksOpenOwn") },
  ];
  const labelId = `${idPrefix}-links-open-label`;

  return (
    <div className="space-y-2">
      <label className="block text-[13px] font-medium" id={labelId}>
        {t("feed.add.linksOpenLabel")}
      </label>
      <Select
        items={items}
        value={value ? "own" : "linked"}
        onValueChange={(v) => v && onChange(v === "own")}
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
        {t("feed.add.linksOpenDescription")}
      </p>
    </div>
  );
}
