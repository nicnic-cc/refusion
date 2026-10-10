import { useRef } from "react";
import { Search, Settings, Rss } from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/brand/logo";
import { TooltipButton } from "@/components/common/tooltip-button";
import { modKey } from "@/lib/shortcut-keys";
import { FeedList } from "@/components/feed/feed-list";
import { PullIndicator } from "@/components/feed/pull-indicator";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useStartPull } from "@/queries/pull";
import { usePullStore } from "@/store/pull";
import { useI18n } from "@/lib/i18n";
import { useUIStore } from "@/store";

export function Sidebar() {
  const { t } = useI18n();
  const { setSearchOpen, setSettingsOpen } = useUIStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isFeedsPage = pathname === "/feeds";
  const feedListRef = useRef<HTMLDivElement>(null);
  const isPullIdle = usePullStore((s) => s.phase === "idle");
  const { mutate: startPull } = useStartPull();
  const { distance, armed } = usePullToRefresh({
    containerRef: feedListRef,
    enabled: isPullIdle,
    onRefresh: () => startPull(),
  });

  return (
    <aside className="sidebar-typography flex h-full w-75 flex-none flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <Logo className="h-6" />
        <div className="ml-auto flex items-center gap-1">
          <TooltipButton
            label={t("common.search")}
            shortcut={`${modKey("K")}, /`}
            className="text-muted-foreground"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-4 w-4" />
          </TooltipButton>
          <TooltipButton
            label={t("sidebar.manageFeeds")}
            shortcut="g f"
            className="text-muted-foreground"
            pressed={isFeedsPage}
            onClick={() => navigate({ to: "/feeds" })}
          >
            <Rss className="h-4 w-4" />
          </TooltipButton>
          <TooltipButton
            label={t("sidebar.settings")}
            shortcut={modKey(",")}
            className="text-muted-foreground"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
          </TooltipButton>
        </div>
      </div>

      <PullIndicator distance={distance} armed={armed} />

      {/* Feed list */}
      <div
        ref={feedListRef}
        className="flex min-h-0 flex-1 flex-col [&_[data-slot=scroll-area-viewport]]:overscroll-y-contain"
      >
        <FeedList />
      </div>
    </aside>
  );
}

