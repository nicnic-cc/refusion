import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { FeedOptionRow } from "@/components/feed/feed-option-row";

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
    <FeedOptionRow
      label={t("feed.add.linksOpenLabel")}
      labelId={labelId}
      description={t("feed.add.linksOpenDescription")}
    >
      <Select
        items={items}
        value={value ? "own" : "linked"}
        onValueChange={(v) => v && onChange(v === "own")}
      >
        <SelectTrigger className="w-44 gap-2 border-border" aria-labelledby={labelId}>
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
    </FeedOptionRow>
  );
}
