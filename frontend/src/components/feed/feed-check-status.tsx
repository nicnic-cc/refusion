import { WithTooltip } from "@/components/common/with-tooltip";
import { Button } from "@/components/ui/button";
import type { Feed } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { usePullStatus, useStartPull } from "@/queries/pull";

// Spells out the feed's last check under its URL, with a manual "Check now".
// Renders as a grid row in the dialog form (col-start-2).
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

  // startPull skips suspended feeds, so the click would do nothing.
  const checkNowButton = (
    <Button
      variant="link"
      size="xs"
      className="h-auto shrink-0 p-0"
      disabled={isChecking || feed.suspended}
      onClick={() => startPull.mutate({ scope: { feed_id: feed.id } })}
    >
      {t("feed.edit.checkNow")}
    </Button>
  );

  return (
    <div className="col-start-2 -mt-2 flex items-center gap-2 text-xs">
      {status && (
        <>
          <div className="min-w-0">{status}</div>
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
        </>
      )}
      {feed.suspended ? (
        // A disabled button gets no pointer events, so the wrapper holds the tooltip.
        <WithTooltip
          label={t("feed.edit.checkNowPaused")}
          render={<span className="inline-flex" />}
        >
          {checkNowButton}
        </WithTooltip>
      ) : (
        checkNowButton
      )}
    </div>
  );
}
