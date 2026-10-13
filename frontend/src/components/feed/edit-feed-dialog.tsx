import { useState, useRef } from "react";
import { Save, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUIStore } from "@/store";
import { useUrlState } from "@/hooks/use-url-state";
import { defaultArticleFilter } from "@/lib/article-filter";
import { useGroups } from "@/queries/groups";
import { useUpdateFeed, useDeleteFeed, useFeedLookup } from "@/queries/feeds";
import { FeedCheckStatus } from "@/components/feed/feed-check-status";
import { useAppInfo } from "@/queries/app";
import {
  apiErrorMessage,
  type ArticleView,
  type UpdateFeedRequest,
} from "@/lib/api";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_PULL_INTERVAL,
  FALLBACK_REFRESH_INTERVALS,
  formatInterval,
  intervalOptions,
} from "@/lib/refresh-interval";
import { DefaultViewSelect } from "@/components/feed/default-view-select";
import { LinksOpenSelect } from "@/components/feed/links-open-select";
import { FeedOptionRow } from "@/components/feed/feed-option-row";
import { FeedCssRow } from "@/components/feed/feed-css-row";

export function EditFeedDialog() {
  const { t } = useI18n();
  const { isEditFeedOpen, editingFeed, setEditFeedOpen } = useUIStore();
  const { data: groups = [] } = useGroups();
  const updateFeedMutation = useUpdateFeed();
  const deleteFeedMutation = useDeleteFeed();
  const { getFeedById } = useFeedLookup();
  const { selectedFeedId, selectTopLevelFilter } = useUrlState();
  // The snapshot taken on open goes stale after a check; the list stays fresh.
  const liveFeed = editingFeed ? getFeedById(editingFeed.id) : undefined;

  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState<string>("");
  const [proxy, setProxy] = useState("");
  const [suspended, setSuspended] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<string>("");
  const [defaultView, setDefaultView] = useState<ArticleView>("feed");
  const [openPermalink, setOpenPermalink] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const groupItems = groups.map((group) => ({
    value: group.id.toString(),
    label: group.name,
  }));

  const { data: appInfo, isLoading: appInfoLoading } = useAppInfo();
  const globalPullInterval = appInfo?.pull_interval ?? DEFAULT_PULL_INTERVAL;
  const options = intervalOptions(
    globalPullInterval,
    appInfo?.allowed_refresh_intervals ?? FALLBACK_REFRESH_INTERVALS,
  );

  // Adjusting state during render (not in an effect) when the feed changes;
  // React re-renders immediately with the reset form.
  const [syncedFeed, setSyncedFeed] = useState<typeof editingFeed>(null);
  if (editingFeed !== syncedFeed) {
    setSyncedFeed(editingFeed);
    if (editingFeed) {
      setUrl(editingFeed.link);
      setName(editingFeed.name);
      setGroupId(editingFeed.group_id.toString());
      setProxy(editingFeed.proxy ?? "");
      setSuspended(editingFeed.suspended);
      // NULL (or a legacy 0) stays "untouched" (empty): the Select shows the
      // live global fallback, and an untouched save sends nothing.
      const stored = editingFeed.refresh_interval_seconds;
      setRefreshInterval(stored && stored > 0 ? stored.toString() : "");
      setDefaultView(editingFeed.default_view);
      setOpenPermalink(editingFeed.open_permalink);
    }
  }

  const resetForm = () => {
    setUrl("");
    setName("");
    setGroupId("");
    setProxy("");
    setSuspended(false);
    setRefreshInterval("");
    setDefaultView("feed");
    setOpenPermalink(false);
    setIsDeleteOpen(false);
  };

  const handleClose = () => {
    setEditFeedOpen(false);
    resetForm();
  };

  const handleSubmit = async () => {
    if (!editingFeed) return;

    if (!url.trim()) {
      toast.error(t("feed.toast.enterUrl"));
      return;
    }

    if (!name.trim()) {
      toast.error(t("feed.toast.enterName"));
      return;
    }

    setIsSubmitting(true);
    try {
      const request: UpdateFeedRequest = {};

      if (url.trim() !== editingFeed.link) {
        request.link = url.trim();
      }

      if (name.trim() !== editingFeed.name) {
        request.name = name.trim();
      }

      const newGroupId = parseInt(groupId, 10);
      if (newGroupId !== editingFeed.group_id) {
        request.group_id = newGroupId;
      }

      if (suspended !== editingFeed.suspended) {
        request.suspended = suspended;
      }

      // "" (not undefined) clears the proxy: undefined is dropped by JSON.stringify.
      const newProxy = proxy.trim();
      if (newProxy !== (editingFeed.proxy ?? "")) {
        request.proxy = newProxy;
      }

      // The global-interval entry means "follow the global setting" and is
      // stored as NULL (cleared via 0); anything else is an explicit override.
      const stored = editingFeed.refresh_interval_seconds;
      const selected = parseInt(refreshInterval || String(globalPullInterval), 10);
      if (selected !== (stored && stored > 0 ? stored : globalPullInterval)) {
        request.refresh_interval_seconds =
          selected === globalPullInterval ? 0 : selected;
      }

      if (defaultView !== editingFeed.default_view) {
        request.default_view = defaultView;
      }

      if (openPermalink !== editingFeed.open_permalink) {
        request.open_permalink = openPermalink;
      }

      if (Object.keys(request).length === 0) {
        toast.info(t("feed.edit.noChanges"));
        handleClose();
        return;
      }

      await updateFeedMutation.mutateAsync({ id: editingFeed.id, ...request });
      toast.success(t("feed.toast.updated"));
      handleClose();
    } catch (error) {
      toast.error(apiErrorMessage(error, t("feed.toast.updateFailed")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingFeed) return;

    setIsDeleting(true);
    try {
      await deleteFeedMutation.mutateAsync(editingFeed.id);
      toast.success(t("feed.toast.unsubscribed", { name: editingFeed.name }));
      setIsDeleteOpen(false);
      handleClose();
      // Leaving the deleted feed's URL; replace keeps Back off the dead page.
      if (selectedFeedId === editingFeed.id) {
        selectTopLevelFilter(defaultArticleFilter);
      }
    } catch {
      toast.error(t("feed.toast.unsubscribeFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog
        open={isEditFeedOpen}
        onOpenChange={(open) => setEditFeedOpen(open)}
      >
        <DialogContent
          className="flex max-h-[calc(100dvh-2rem)] w-full flex-col sm:max-w-2xl gap-0 overflow-hidden p-0"
          showCloseButton={false}
          initialFocus={urlInputRef}
        >
          {/* Header */}
          <DialogHeader className="flex flex-row items-center justify-between border-b px-5 py-4">
            <DialogTitle className="flex items-center gap-1.5 text-base font-semibold">
              <span>{t("feed.edit.title")}</span>
            </DialogTitle>
            <Button variant="ghost" size="icon-sm" onClick={handleClose}>
              <span className="sr-only">{t("common.cancel")}</span>
              <X className="h-[18px] w-[18px] text-muted-foreground" />
            </Button>
          </DialogHeader>

          {/* Form Content */}
          <div className="grid min-h-0 flex-1 grid-cols-[14rem_minmax(0,1fr)] items-center gap-x-6 gap-y-4 overflow-y-auto p-5">
            {/* Name Section */}
            <FeedOptionRow
              label={t("feed.add.nameLabel")}
              htmlFor="edit-feed-name"
              fill
            >
              <Input
                id="edit-feed-name"
                name="feed-name"
                placeholder={t("feed.add.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 w-full"
                autoComplete="off"
              />
            </FeedOptionRow>

            {/* URL Section */}
            <FeedOptionRow
              label={t("feed.add.urlLabel")}
              htmlFor="edit-feed-url"
              fill
            >
              <Input
                ref={urlInputRef}
                id="edit-feed-url"
                name="feed-url"
                type="url"
                inputMode="url"
                placeholder={t("feed.add.urlPlaceholder")}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-9 w-full"
                autoComplete="off"
                spellCheck={false}
              />
            </FeedOptionRow>
            {liveFeed && <FeedCheckStatus feed={liveFeed} />}

            {/* Group Section */}
            <FeedOptionRow
              label={t("feed.add.groupLabel")}
              labelId="edit-feed-group-label"
            >
              <Select
                items={groupItems}
                value={groupId || null}
                onValueChange={(v) => {
                  if (v) setGroupId(v);
                }}
              >
                <SelectTrigger
                  className="w-44 gap-2 border-border"
                  aria-labelledby="edit-feed-group-label"
                >
                  <SelectValue placeholder={t("feed.add.groupPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {groupItems.map((group) => (
                    <SelectItem key={group.value} value={group.value}>
                      {group.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FeedOptionRow>

            {/* Suspended Toggle */}
            <FeedOptionRow
              label={t("feed.edit.suspendLabel")}
              htmlFor="edit-feed-suspended"
              description={t("feed.edit.suspendDescription")}
            >
              <Switch
                id="edit-feed-suspended"
                checked={suspended}
                onCheckedChange={setSuspended}
              />
            </FeedOptionRow>

            {/* Divider before the per-feed options */}
            <div className="col-span-2 border-t" />

            <FeedOptionRow
              label={t("feed.add.refreshFrequencyLabel")}
              labelId="edit-feed-refresh-label"
            >
              <Select
                items={options.map((seconds) => ({
                  value: seconds.toString(),
                  label: formatInterval(seconds),
                }))}
                disabled={appInfoLoading}
                value={refreshInterval || String(globalPullInterval)}
                onValueChange={(v) => v && setRefreshInterval(v)}
              >
                <SelectTrigger
                  className="w-44 gap-2 border-border"
                  aria-labelledby="edit-feed-refresh-label"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((seconds) => (
                    <SelectItem key={seconds} value={seconds.toString()}>
                      {formatInterval(seconds)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FeedOptionRow>
            <DefaultViewSelect
              idPrefix="edit-feed"
              value={defaultView}
              onChange={setDefaultView}
            />
            <LinksOpenSelect
              idPrefix="edit-feed"
              value={openPermalink}
              onChange={setOpenPermalink}
            />
            <FeedOptionRow
              label={t("feed.add.proxyLabel")}
              htmlFor="edit-feed-proxy"
              description={t("feed.add.proxyHint")}
              fill
            >
              <Input
                id="edit-feed-proxy"
                name="feed-proxy"
                type="url"
                inputMode="url"
                placeholder={t("feed.add.proxyPlaceholder")}
                value={proxy}
                onChange={(e) => setProxy(e.target.value)}
                className="h-9 w-full"
                autoComplete="off"
                spellCheck={false}
              />
            </FeedOptionRow>
            {editingFeed && <FeedCssRow feed={editingFeed} />}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t px-5 py-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setIsDeleteOpen(true)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t("feed.edit.unsubscribe")}
            </Button>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handleClose}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !url.trim() || !name.trim()}
              >
                <Save className="mr-1.5 h-4 w-4" />
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("feed.edit.deleteConfirm.title")}</DialogTitle>
            <DialogDescription>
              {t("feed.edit.deleteConfirm.description", {
                name: editingFeed?.name ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteOpen(false)}
              disabled={isDeleting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? t("common.deleting") : t("feed.edit.unsubscribe")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
