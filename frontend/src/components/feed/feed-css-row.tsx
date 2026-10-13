import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FeedOptionRow } from "@/components/feed/feed-option-row";
import { FeedCssDialog } from "@/components/feed/feed-css-dialog";
import type { Feed } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useFeedWebCSS } from "@/queries/feed-web-css";

// Owns the CSS lookup and the dialog, so the edit-feed dialog stays unchanged
// apart from rendering this row.
export function FeedCssRow({ feed }: { feed: Feed }) {
  const { t } = useI18n();
  const css = useFeedWebCSS(feed.id);
  const [open, setOpen] = useState(false);
  return (
    <>
      <FeedOptionRow
        label={t("feedCss.row.label")}
        labelId="edit-feed-css-label"
        description={t("feedCss.row.description")}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          id="edit-feed-css-button"
          aria-labelledby="edit-feed-css-label edit-feed-css-button"
          onClick={() => setOpen(true)}
        >
          {t(css ? "feedCss.button.edit" : "feedCss.button.add")}
        </Button>
      </FeedOptionRow>
      <FeedCssDialog feed={feed} css={css} open={open} onOpenChange={setOpen} />
    </>
  );
}
