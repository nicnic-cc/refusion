import { memo, useRef } from "react";
import { Ellipsis, Keyboard, Rss, Search, Settings } from "lucide-react";
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
import { modKey } from "@/lib/shortcut-keys";
import { FeedList } from "@/components/feed/feed-list";
import { PullIndicator } from "@/components/feed/pull-indicator";
import { useUrlState } from "@/hooks/use-url-state";
import { useFeedLookup } from "@/queries/feeds";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useStartPull } from "@/queries/pull";
import { usePullStore } from "@/store/pull";
import { useI18n } from "@/lib/i18n";
import { useUIStore } from "@/store";

export const Sidebar = memo(function Sidebar() {
  const { t } = useI18n();
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const setShortcutsOpen = useUIStore((s) => s.setShortcutsOpen);
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
    <aside className="sidebar-typography flex h-full w-75 flex-none flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
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
          <TooltipButton
            label={t("common.search")}
            shortcut={`${modKey("K")}, /`}
            className="text-muted-foreground"
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
                      className="text-muted-foreground"
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
