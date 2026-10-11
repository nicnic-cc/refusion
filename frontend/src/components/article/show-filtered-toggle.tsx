import { Funnel } from "lucide-react";
import { TooltipButton } from "@/components/common/tooltip-button";
import {
  useFeedHasActiveFilter,
  useShowFilteredToggle,
} from "@/hooks/use-show-filtered";
import { useI18n } from "@/lib/i18n";

// Header toggle: also list the articles this feed's filter hides.
export function ShowFilteredToggle({
  feedId,
  disabled,
}: {
  feedId: number | null;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const hasFilter = useFeedHasActiveFilter(feedId);
  const { active, toggle } = useShowFilteredToggle(feedId);

  if (!hasFilter || disabled) return null;

  return (
    <TooltipButton
      label={t("article.list.showFiltered")}
      pressed={active}
      onClick={toggle}
    >
      <Funnel className="h-4 w-4" />
    </TooltipButton>
  );
}
