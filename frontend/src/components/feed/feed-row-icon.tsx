import { AlertCircle, Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FeedFavicon } from "@/components/feed/feed-favicon";
import { getFaviconUrl } from "@/lib/api/favicon";
import type { Feed } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { usePullStatus } from "@/queries/pull";

// Same 16px box in every state so rows never shift. Reads the shared status
// query only; the app-wide poller owns the requests.
export function FeedRowIcon({ feed }: { feed: Feed }) {
  const { t } = useI18n();
  const { data } = usePullStatus();
  const error = feed.fetch_state.last_error?.trim();

  if (data?.pending.includes(feed.id)) {
    return (
      <Loader2
        aria-label={t("pull.checking")}
        className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
      />
    );
  }

  if (error) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              role="img"
              aria-label={t("feeds.status.error")}
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-destructive"
            />
          }
        >
          <AlertCircle className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent
          side="right"
          className="max-w-sm whitespace-normal break-words"
        >
          {error}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <FeedFavicon
      src={getFaviconUrl(feed.link, feed.site_url)}
      className="h-4 w-4"
    />
  );
}
