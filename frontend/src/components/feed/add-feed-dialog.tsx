import { useState } from "react";
import { Plus, Radar, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TooltipButton } from "@/components/common/tooltip-button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUIStore } from "@/store";
import { useGroups } from "@/queries/groups";
import { useCreateFeed } from "@/queries/feeds";
import { useAppInfo } from "@/queries/app";
import {
  apiErrorMessage,
  feedAPI,
  type ArticleView,
  type CreateFeedRequest,
  type DiscoveredFeed,
} from "@/lib/api";
import { toast } from "sonner";
import { DEFAULT_GROUP_ID } from "@/lib/groups";
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_PULL_INTERVAL,
  FALLBACK_REFRESH_INTERVALS,
  formatInterval,
  intervalOptions,
} from "@/lib/refresh-interval";
import { cn } from "@/lib/utils";
import { DefaultViewSelect } from "@/components/feed/default-view-select";
import { LinksOpenSelect } from "@/components/feed/links-open-select";
import { FeedOptionRow } from "@/components/feed/feed-option-row";

export function AddFeedDialog() {
  const { t } = useI18n();
  const { isAddFeedOpen, setAddFeedOpen } = useUIStore();
  const { data: groups = [] } = useGroups();
  const createFeed = useCreateFeed();

  const { data: appInfo, isLoading: appInfoLoading } = useAppInfo();
  const globalPullInterval = appInfo?.pull_interval ?? DEFAULT_PULL_INTERVAL;
  const options = intervalOptions(
    globalPullInterval,
    appInfo?.allowed_refresh_intervals ?? FALLBACK_REFRESH_INTERVALS,
  );

  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState<string>("");
  const [proxy, setProxy] = useState("");
  const [refreshInterval, setRefreshInterval] = useState<string>("");
  const [defaultView, setDefaultView] = useState<ArticleView>("feed");
  const [openPermalink, setOpenPermalink] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [detectedFeeds, setDetectedFeeds] = useState<DiscoveredFeed[]>([]);
  // Every feed detection returned in this dialog session; submitting one of
  // these URLs skips a second validate round trip.
  const [knownFeeds, setKnownFeeds] = useState<DiscoveredFeed[]>([]);
  const [isFeedSelectOpen, setIsFeedSelectOpen] = useState(false);
  const groupItems = groups.map((group) => ({
    value: group.id.toString(),
    label: group.name,
  }));

  const resetForm = () => {
    setUrl("");
    setName("");
    setGroupId("");
    setProxy("");
    setRefreshInterval("");
    setDefaultView("feed");
    setOpenPermalink(false);
    setDetectedFeeds([]);
    setKnownFeeds([]);
    setIsFeedSelectOpen(false);
  };

  const handleClose = () => {
    setAddFeedOpen(false);
    resetForm();
  };

  const handleSelectDetectedFeed = (feed: DiscoveredFeed) => {
    setUrl(feed.link);
    setName((prev) => {
      if (prev.trim() || !feed.title.trim()) {
        return prev;
      }
      return feed.title.trim();
    });
    setIsFeedSelectOpen(false);
    setDetectedFeeds([]);
    toast.success(t("feed.toast.detected"));
  };

  const normalizeUrl = (value: string) =>
    value.trim().replace(/\/+$/, "").toLowerCase();

  const validateRequest = (target: string) => ({
    url: target,
    ...(proxy.trim() ? { proxy: proxy.trim() } : {}),
  });

  const handleValidate = async () => {
    if (!url.trim()) return;

    setIsValidating(true);
    try {
      const response = await feedAPI.validate(validateRequest(url.trim()));
      const feeds = response.data?.feeds ?? [];
      setKnownFeeds((prev) => [...prev, ...feeds]);

      if (feeds.length === 0) {
        toast.info(t("feed.toast.noFeedsForUrl"));
        return;
      }

      if (feeds.length === 1) {
        handleSelectDetectedFeed(feeds[0]);
        return;
      }

      setDetectedFeeds(feeds);
      setIsFeedSelectOpen(true);
    } catch {
      toast.error(t("feed.toast.detectFailed"));
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (!url.trim()) {
      toast.error(t("feed.toast.enterUrl"));
      return;
    }

    setIsSubmitting(true);
    try {
      // Validate before creating so an unreachable or malformed URL fails
      // here with a clear message instead of a "successful" empty feed.
      const known = knownFeeds.find(
        (f) => normalizeUrl(f.link) === normalizeUrl(url),
      );
      let feeds: DiscoveredFeed[];
      if (known) {
        feeds = [known];
      } else {
        setIsLookingUp(true);
        try {
          const check = await feedAPI.validate(validateRequest(url.trim()));
          feeds = check.data?.feeds ?? [];
        } finally {
          setIsLookingUp(false);
        }
      }
      if (feeds.length === 0) {
        toast.error(t("feed.toast.invalidFeed"));
        return;
      }

      // Discovery also reports feeds found elsewhere on the host (common
      // paths, service matchers), so a non-empty list does not prove the
      // entered URL itself is a feed. Only proceed when the entered URL
      // matched; otherwise adopt a single unambiguous discovery, or make the
      // user pick when several were found.
      const entered = url.trim();
      const match = feeds.find(
        (f) => normalizeUrl(f.link) === normalizeUrl(entered),
      );

      let link = entered;
      let title = "";
      if (match) {
        // Prefer the discovered link: the entered URL may differ in ways the
        // normalization ignores (trailing slash) that not every server accepts.
        link = match.link;
        title = match.title.trim();
        setUrl(link);
      } else if (feeds.length === 1) {
        link = feeds[0].link;
        title = feeds[0].title.trim();
        setUrl(link);
      } else {
        setDetectedFeeds(feeds);
        setIsFeedSelectOpen(true);
        return;
      }
      if (!name.trim() && title) {
        setName(title);
      }

      const selectedGroupId = groupId
        ? parseInt(groupId, 10)
        : DEFAULT_GROUP_ID;

      const request: CreateFeedRequest = {
        link,
        name: name.trim() || title || link,
        group_id: selectedGroupId,
      };

      if (proxy.trim()) {
        request.proxy = proxy.trim();
      }

      if (refreshInterval && refreshInterval !== String(globalPullInterval)) {
        request.refresh_interval_seconds = parseInt(refreshInterval, 10);
      }

      if (defaultView !== "feed") {
        request.default_view = defaultView;
      }

      if (openPermalink) {
        request.open_permalink = true;
      }

      await createFeed.mutateAsync(request);
      toast.success(t("feed.toast.added"));
      handleClose();
    } catch (error) {
      toast.error(apiErrorMessage(error, t("feed.toast.addFailed")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={isAddFeedOpen} onOpenChange={setAddFeedOpen}>
        <DialogContent
          className="flex max-h-[calc(100dvh-2rem)] w-full flex-col sm:max-w-2xl gap-0 overflow-hidden p-0"
          showCloseButton={false}
        >
          {/* Header */}
          <DialogHeader className="flex flex-row items-center justify-between border-b px-5 py-4">
            <DialogTitle className="text-base font-semibold">
              {t("feed.add.title")}
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
              htmlFor="add-feed-name"
              fill
            >
              <Input
                id="add-feed-name"
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
              htmlFor="add-feed-url"
              description={t("feed.add.detectHint")}
              fill
            >
              <Input
                id="add-feed-url"
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
              <TooltipButton
                variant="outline"
                size="icon"
                label={
                  isValidating
                    ? t("feed.add.lookingForFeed")
                    : t("feed.add.validateTitle")
                }
                className="h-9 w-9 shrink-0"
                onClick={handleValidate}
                disabled={isValidating || !url.trim()}
              >
                <Radar
                  className={cn(
                    "h-[18px] w-[18px]",
                    isValidating && "animate-pulse",
                  )}
                />
              </TooltipButton>
            </FeedOptionRow>

            {/* Group Section */}
            <FeedOptionRow
              label={t("feed.add.groupLabel")}
              labelId="add-feed-group-label"
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
                  aria-labelledby="add-feed-group-label"
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

            {/* Divider before the per-feed options */}
            <div className="col-span-2 border-t" />

            <FeedOptionRow
              label={t("feed.add.refreshFrequencyLabel")}
              labelId="add-feed-refresh-label"
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
                  aria-labelledby="add-feed-refresh-label"
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
              idPrefix="add-feed"
              value={defaultView}
              onChange={setDefaultView}
            />
            <LinksOpenSelect
              idPrefix="add-feed"
              value={openPermalink}
              onChange={setOpenPermalink}
            />
            <FeedOptionRow
              label={t("feed.add.proxyLabel")}
              htmlFor="add-feed-proxy"
              description={t("feed.add.proxyHint")}
              fill
            >
              <Input
                id="add-feed-proxy"
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
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t px-5 py-4">
            <Button variant="outline" onClick={handleClose}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !url.trim()}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {isLookingUp ? t("feed.add.lookingForFeed") : t("feed.add.button")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isFeedSelectOpen}
        onOpenChange={(open) => {
          setIsFeedSelectOpen(open);
          if (!open) {
            setDetectedFeeds([]);
          }
        }}
      >
        <DialogContent
          className="w-full sm:max-w-[560px] p-0"
          showCloseButton={false}
        >
          <DialogHeader className="flex flex-row items-center justify-between border-b px-5 py-4">
            <div>
              <DialogTitle className="text-base font-semibold">
                {t("feed.select.title")}
              </DialogTitle>
              <DialogDescription>
                {t("feed.select.description")}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setIsFeedSelectOpen(false);
                setDetectedFeeds([]);
              }}
            >
              <span className="sr-only">{t("common.cancel")}</span>
              <X className="h-[18px] w-[18px] text-muted-foreground" />
            </Button>
          </DialogHeader>

          <div className="max-h-[360px] space-y-2 overflow-y-auto p-4">
            {detectedFeeds.map((feed, index) => (
              <button
                key={`${feed.link}-${index}`}
                type="button"
                onClick={() => handleSelectDetectedFeed(feed)}
                className="w-full rounded-md border p-3 text-left transition-colors hover:bg-accent/50"
              >
                <p className="truncate text-sm font-medium">
                  {feed.title || t("feed.select.fallback", { index: index + 1 })}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {feed.link}
                </p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
