import { useEffect } from "react";
import { useMatches, useRouter } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { ArticleDrawer } from "@/components/article/article-drawer";
import { SearchDialog } from "@/components/search/search-dialog";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { AddGroupDialog } from "@/components/group/add-group-dialog";
import { AddFeedDialog } from "@/components/feed/add-feed-dialog";
import { EditFeedDialog } from "@/components/feed/edit-feed-dialog";
import { ImportOpmlDialog } from "@/components/feed/import-opml-dialog";
import { ShortcutsDialog } from "@/components/layout/shortcuts-dialog";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard";
import { usePullRun } from "@/hooks/use-pull-run";
import { useMissingScopeRedirect } from "@/hooks/use-missing-scope-redirect";
import { usePrefetchFilterViews } from "@/hooks/use-prefetch-filter-views";
import { useI18n } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-mobile";
import { useReadingPane } from "@/hooks/use-reading-pane";
import { useUIStore } from "@/store/ui";

// Its own component so the feeds/groups fetch state re-renders only this null.
function MissingScopeRedirect() {
  useMissingScopeRedirect();
  return null;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);

  // The layout is shared by all pages; only article routes mount an
  // ArticlePane instead of the drawer.
  const onFeedsPage = useMatches({
    select: (ms) => ms.some((m) => m.routeId === "/feeds"),
  });
  const readingPane = useReadingPane() && !onFeedsPage;

  // Register global keyboard shortcuts
  useKeyboardShortcuts();
  usePullRun();
  usePrefetchFilterViews();

  // Close mobile sidebar on navigation. Subscribing to the router instead of
  // reading the location keeps this layout from re-rendering on every URL change.
  const router = useRouter();
  useEffect(() => {
    setSidebarOpen(false);
    return router.subscribe("onResolved", ({ hrefChanged }) => {
      if (hrefChanged) setSidebarOpen(false);
    });
  }, [router, setSidebarOpen]);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Desktop sidebar */}
      {!isMobile && <Sidebar />}

      {/* Mobile sidebar */}
      {isMobile && (
        <Sheet open={isSidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent
            side="left"
            className="data-[side=left]:w-75 data-[side=left]:sm:max-w-none p-0"
            showCloseButton={false}
          >
            <SheetTitle className="sr-only">{t("common.navigation")}</SheetTitle>
            <Sidebar />
          </SheetContent>
        </Sheet>
      )}

      <MissingScopeRedirect />

      {/* Main content */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {/* Modals and drawers */}
      {!readingPane && <ArticleDrawer />}
      <SearchDialog />
      <SettingsDialog />
      <AddGroupDialog />
      <AddFeedDialog />
      <EditFeedDialog />
      <ImportOpmlDialog />
      <ShortcutsDialog />
    </div>
  );
}
