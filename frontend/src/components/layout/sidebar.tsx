import { LogOut, Search, Settings, Rss } from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { TooltipButton } from "@/components/common/tooltip-button";
import { FeedList } from "@/components/feed/feed-list";
import { sessionAPI } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useUIStore } from "@/store";
import { resetSessionGuard } from "@/routes/__root";

export function Sidebar() {
  const { t } = useI18n();
  const { setSearchOpen, setSettingsOpen } = useUIStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const isFeedsPage = pathname === "/feeds";

  const handleSignOut = async () => {
    if (!window.confirm(t("sidebar.signOutConfirm"))) {
      return;
    }
    try {
      await sessionAPI.logout();
    } catch {
      toast.error(t("sidebar.signOutFailed"));
      return;
    }

    queryClient.clear();
    // A full-page navigation leaves this document so the route guard starts
    // fresh; the SPA router would keep its cached "session verified" verdict.
    resetSessionGuard();
    window.location.assign("/login");
  };

  return (
    <aside className="sidebar-typography flex h-full w-75 flex-none flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <Logo className="h-6" />
      </div>

      {/* Search button */}
      <div className="px-2 pt-3">
        <button
          className="flex w-full items-center justify-between rounded-md bg-muted px-3 py-2 text-muted-foreground transition-colors hover:bg-accent"
          onClick={() => setSearchOpen(true)}
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            <span className="text-sm">{t("sidebar.search")}</span>
          </div>
          <kbd className="rounded bg-accent px-1.5 py-0.5 font-mono text-[11px] font-medium">
            Cmd+K / ?
          </kbd>
        </button>
      </div>

      {/* Feed list */}
      <FeedList />

      {/* Footer */}
      <div className="flex shrink-0 items-center gap-2 border-t px-4 py-3">
        <TooltipButton
          label={t("sidebar.manageFeeds")}
          className="text-muted-foreground"
          pressed={isFeedsPage}
          onClick={() => navigate({ to: "/feeds" })}
        >
          <Rss className="h-4 w-4" />
        </TooltipButton>
        <TooltipButton
          label={t("sidebar.settings")}
          className="text-muted-foreground"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="h-4 w-4" />
        </TooltipButton>
        <TooltipButton
          label={t("sidebar.signOut")}
          className="ml-auto text-muted-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
        </TooltipButton>
      </div>
    </aside>
  );
}

