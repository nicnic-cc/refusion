import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

interface NewArticlesPillProps {
  count: number;
  onClick: () => void;
}

/** Zero-height sticky strip, so the pill floats over the rows without moving them. */
export function NewArticlesPill({ count, onClick }: NewArticlesPillProps) {
  const { t } = useI18n();
  if (count <= 0) return null;

  return (
    <div className="pointer-events-none sticky top-0 z-10 flex h-0 justify-center">
      <Button
        size="sm"
        className="pointer-events-auto mt-2 rounded-full shadow-md"
        onClick={onClick}
      >
        {t(count === 1 ? "pull.newArticles.one" : "pull.newArticles.other", {
          count,
        })}
      </Button>
    </div>
  );
}
