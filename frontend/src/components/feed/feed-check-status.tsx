import { Button } from "@/components/ui/button";
import type { Feed } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { usePullStatus, useStartPull } from "@/queries/pull";

// Spells out the feed's last check under its URL, with a manual "Check now".
// It checks the saved feed: unsaved edits in the dialog are not used.
export function FeedCheckStatus({ feed }: { feed: Feed }) {
  const { t } = useI18n();
  const startPull = useStartPull();
  const { data: pullStatus } = usePullStatus();
  const isChecking =
    startPull.isPending || !!pullStatus?.pending.includes(feed.id);
  const error = feed.fetch_state.last_error?.trim();
  const checkedAt = feed.fetch_state.last_checked_at;

  let status: React.ReactNode = null;
  if (isChecking) {
    status = <span className="text-muted-foreground">{t("pull.checking")}</span>;
  } else if (error) {
    status = (
      <span className="wrap-break-word text-destructive">
        {t("feed.error.lastCheckFailed", { error })}
      </span>
    );
  } else if (checkedAt > 0) {
    status = (
      <span className="text-muted-foreground">
        {t("feed.edit.lastChecked", { when: formatDate(checkedAt) })}
      </span>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <div className="min-w-0 pt-0.5">{status}</div>
      <Button
        variant="link"
        size="xs"
        className="h-auto shrink-0 p-0"
        disabled={isChecking}
        onClick={() => startPull.mutate({ scope: { feed_id: feed.id } })}
      >
        {t("feed.edit.checkNow")}
      </Button>
    </div>
  );
}
