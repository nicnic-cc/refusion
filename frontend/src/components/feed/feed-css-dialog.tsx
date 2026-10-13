import { useEffect, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage, itemAPI } from "@/lib/api";
import type { Feed, FeedWebCSS } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useDeleteFeedWebCSS,
  useNewestFeedItem,
  useSaveFeedWebCSS,
} from "@/queries/feed-web-css";

const PREVIEW_DEBOUNCE_MS = 750;
// Mirrors the server's cap (store.MaxFeedWebCSSBytes), which also guards ?css=.
const MAX_CSS_BYTES = 32 << 10;

interface FeedCssDialogProps {
  feed: Feed;
  css?: FeedWebCSS;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedCssDialog({
  feed,
  css,
  open,
  onOpenChange,
}: FeedCssDialogProps) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90dvh] w-full max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle className="text-base font-semibold">
            {t("feedCss.title")}
          </DialogTitle>
          <DialogDescription className="truncate">{feed.name}</DialogDescription>
        </DialogHeader>
        <FeedCssForm feed={feed} css={css} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function FeedCssForm({
  feed,
  css,
  onClose,
}: {
  feed: Feed;
  css?: FeedWebCSS;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const saveMutation = useSaveFeedWebCSS();
  const deleteMutation = useDeleteFeedWebCSS();
  const newest = useNewestFeedItem(feed.id, true);
  const initial = css?.css ?? "";
  const [draft, setDraft] = useState(initial);
  // The draft the preview shows: lags the draft by the debounce.
  const [previewCss, setPreviewCss] = useState(initial);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<"css" | "preview">("css");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const overCap = new TextEncoder().encode(draft).length > MAX_CSS_BYTES;

  useEffect(() => {
    if (overCap) return;
    const timer = setTimeout(() => setPreviewCss(draft), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, overCap]);

  const item = newest.data;
  const src = item ? itemAPI.pageUrl(item.id, previewCss) : null;
  const frameKey = `${reloadNonce}:${src}`;
  const loading = src !== null && loadedKey !== frameKey;

  // A new nonce remounts the iframe, so Reload works with an unchanged src.
  const reload = () => {
    setPreviewCss(draft);
    setReloadNonce((n) => n + 1);
  };

  const changed = draft !== initial;
  const busy = saveMutation.isPending || deleteMutation.isPending;

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync({ feedId: feed.id, css: draft });
      toast.success(
        t(draft.trim() === "" ? "feedCss.toast.deleted" : "feedCss.toast.saved"),
      );
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, t("feedCss.toast.saveFailed")));
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(feed.id);
      toast.success(t("feedCss.toast.deleted"));
      onClose();
    } catch {
      toast.error(t("feedCss.toast.deleteFailed"));
    }
  };

  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "css" | "preview")}
        className="border-b px-5 py-2 md:hidden"
      >
        <TabsList>
          <TabsTrigger value="css">{t("feedCss.tab.css")}</TabsTrigger>
          <TabsTrigger value="preview">{t("feedCss.tab.preview")}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-col gap-2 p-5 md:border-r",
            tab !== "css" && "max-md:hidden",
          )}
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={t("feedCss.tab.css")}
            aria-invalid={overCap}
            placeholder=".sidebar { display: none !important; }"
            className="min-h-0 flex-1 resize-none font-mono text-[13px] [field-sizing:fixed]"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {overCap ? (
            <p className="text-xs text-destructive">{t("feedCss.tooLarge")}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{t("feedCss.hint")}</p>
          )}
        </div>

        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-col",
            tab !== "preview" && "max-md:hidden",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b px-5 py-2">
            <span className="min-w-0 truncate text-[13px] text-muted-foreground">
              {item?.title}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!item || overCap}
              onClick={reload}
            >
              <RefreshCw />
              {t("feedCss.reload")}
            </Button>
          </div>
          {src && item ? (
            <iframe
              key={frameKey}
              src={src}
              title={item.title}
              onLoad={() => setLoadedKey(frameKey)}
              className={cn(
                "min-h-0 w-full flex-1 border-0 bg-white transition-opacity",
                loading && "opacity-60",
              )}
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
              referrerPolicy="no-referrer"
            />
          ) : (
            <p className="p-5 text-[13px] text-muted-foreground">
              {newest.isPending
                ? null
                : t(newest.isError ? "feedCss.preview.failed" : "feedCss.preview.none")}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-5 py-4">
        {css ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            onClick={() => setConfirmDeleteOpen(true)}
          >
            <Trash2 />
            {t("feedCss.delete")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!changed || overCap || busy} onClick={handleSave}>
            {t("common.save")}
          </Button>
        </div>
      </div>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("feedCss.deleteConfirm.title")}</DialogTitle>
            <DialogDescription>
              {t("feedCss.deleteConfirm.description", { name: feed.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={deleteMutation.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? t("common.deleting")
                : t("feedCss.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
