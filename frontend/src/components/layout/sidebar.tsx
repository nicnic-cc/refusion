import { memo, useRef } from "react";
import {
  CircleAlert,
  Ellipsis,
  Keyboard,
  Rss,
  Search,
  Settings,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/brand/logo";
import { TooltipButton } from "@/components/common/tooltip-button";
import { SharedTooltipTrigger } from "@/components/common/shared-tooltip";
import { ArticleFilterSwitch } from "@/components/article/article-filter-switch";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { modKey } from "@/lib/shortcut-keys";
import { FeedList } from "@/components/feed/feed-list";
import { PullIndicator } from "@/components/feed/pull-indicator";
import { useUrlState } from "@/hooks/use-url-state";
import { useFeedLookup } from "@/queries/feeds";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useStartPull } from "@/queries/pull";
import { usePullStore } from "@/store/pull";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useAppInfo } from "@/queries/app";
import { useUIStore } from "@/store";

// Notice codes from GET /api/app. Unknown codes are ignored so the backend can
// ship new notices before the client knows their copy.
const noticeMessages: Record<
  string,
  { title: TranslationKey; body: TranslationKey }
> = {
  oidc_allowed_user_unset: {
    title: "sidebar.notices.oidcAllowedUserUnset.title",
    body: "sidebar.notices.oidcAllowedUserUnset.body",
  },
};

export const Sidebar = memo(function Sidebar() {
  const { t } = useI18n();
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const setShortcutsOpen = useUIStore((s) => s.setShortcutsOpen);
  const { data: appInfo } = useAppInfo();
  const notices = (appInfo?.notices ?? []).flatMap((code) => {
    const message = noticeMessages[code];
    return message ? [message] : [];
  });
  const navigate = useNavigate();
  const { articleFilter, setArticleFilter } = useUrlState({ article: false });
  const { feeds, isLoading: isFeedsLoading } = useFeedLookup();
  const hasNoFeeds = !isFeedsLoading && feeds.length === 0;
  const feedListRef = useRef<HTMLDivElement>(null);
  const isPullIdle = usePullStore((s) => s.phase === "idle");
  const { mutate: startPull } = useStartPull();
  const { distance, armed } = usePullToRefresh({
    containerRef: feedListRef,
    enabled: isPullIdle,
    onRefresh: () => startPull({ pane: "sidebar" }),
  });

  return (
    <aside className="sidebar-typography flex h-full max-md:w-full md:w-75 flex-none flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="fork-safe-top flex h-14 shrink-0 items-center gap-2 max-md:gap-1 border-b px-4 max-md:px-3">
        <Logo className="h-6 shrink-0" />
        <div className="flex min-w-0 flex-1 justify-center">
          {!hasNoFeeds && (
            <ArticleFilterSwitch
              value={articleFilter}
              onValueChange={setArticleFilter}
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {notices.length > 0 && (
            <Popover>
              <PopoverTrigger
                aria-label={t("sidebar.notices.label")}
                className="rounded-md p-1.5 text-amber-600 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 max-md:flex max-md:size-11 max-md:items-center max-md:justify-center"
              >
                <CircleAlert className="h-4 w-4" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 gap-3">
                {/* One title names the popover; each notice carries its own heading. */}
                <PopoverTitle className="sr-only">
                  {t("sidebar.notices.label")}
                </PopoverTitle>
                {notices.map((notice) => (
                  <div key={notice.title} className="flex flex-col gap-1">
                    <h3 className="font-medium">{t(notice.title)}</h3>
                    <p className="text-muted-foreground">{t(notice.body)}</p>
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          )}
          <TooltipButton
            label={t("common.search")}
            shortcut={`${modKey("K")}, /`}
            className="text-muted-foreground max-md:size-11"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-4 w-4" />
          </TooltipButton>
          <DropdownMenu>
            <SharedTooltipTrigger
              tip={t("sidebar.more")}
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={t("sidebar.more")}
                      className="text-muted-foreground max-md:size-11"
                    />
                  }
                />
              }
            >
              <Ellipsis className="h-4 w-4" />
            </SharedTooltipTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-52">
              <DropdownMenuItem onClick={() => navigate({ to: "/feeds" })}>
                <Rss />
                {t("sidebar.manageFeeds")}
                <DropdownMenuShortcut>g f</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                <Settings />
                {t("sidebar.settings")}
                <DropdownMenuShortcut>{modKey(",")}</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShortcutsOpen(true)}>
                <Keyboard />
                {t("shortcuts.title")}
                <DropdownMenuShortcut>?</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <PullIndicator pane="sidebar" distance={distance} armed={armed} />

      {/* Feed list */}
      <div
        ref={feedListRef}
        className="flex min-h-0 flex-1 flex-col [&_[data-slot=scroll-area-viewport]]:overscroll-y-contain"
      >
        <FeedList />
      </div>
    </aside>
  );
});
