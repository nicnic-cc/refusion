import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { useI18n } from "@/lib/i18n";
import { getFeedErrorPreview } from "@/lib/feed-error";
import { useFeedLookup } from "@/queries/feeds";

// Shown only while a single feed is open, so All and folders stay quiet.
export function FeedErrorLine({ feedId }: { feedId: number | null }) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const { getFeedById } = useFeedLookup();
  // Tap toggles the tooltip on mobile, as in the edit dialog header.
  const [mobileOpen, setMobileOpen] = useState(false);

  const error = feedId ? getFeedById(feedId)?.fetch_state.last_error?.trim() : "";
  if (!error) return null;

  const preview = getFeedErrorPreview(error);
  const text = t("feed.error.lastCheckFailed", { error: preview });
  // The tooltip only earns its place when the preview cut the error short.
  if (preview === error.replace(/\s+/g, " ")) {
    return (
      <p className="truncate px-4 text-xs text-destructive sm:px-6">{text}</p>
    );
  }

  return (
    <div className="px-4 sm:px-6">
      <Tooltip
        open={isMobile ? mobileOpen : undefined}
        onOpenChange={(open) => {
          if (!isMobile || open) return;
          setMobileOpen(false);
        }}
      >
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => {
                if (isMobile) setMobileOpen((open) => !open);
              }}
              className="block w-full cursor-help truncate text-left text-xs text-destructive"
            />
          }
        >
          {text}
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="max-w-sm whitespace-normal break-words"
        >
          {error}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
