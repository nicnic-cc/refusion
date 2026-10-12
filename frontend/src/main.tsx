import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { routeTree } from "./routeTree.gen";
import { NotFoundRedirect } from "@/components/not-found-redirect";
import { Toaster } from "@/components/ui/sonner";
import { setUnauthorizedCallback } from "@/lib/api";
import { defaultArticleFilter } from "@/lib/article-filter";
import { preloadLocaleMessages } from "@/lib/i18n";
import { queryClient } from "@/lib/query-client";
import { registerPWA } from "@/lib/pwa";
import { usePreferencesStore } from "@/store";
import "./index.css";
import "./focus-tab-only";

// Create a new router instance
const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundRedirect,
});

// Lazy route chunks otherwise start loading only after the root guard's
// session and settings requests finish; start them now. The bare "/" redirects
// to the default filter page, so warm that one.
const startupPath =
  router.latestLocation.pathname === "/"
    ? `/${defaultArticleFilter}`
    : router.latestLocation.pathname;
for (const route of router.getMatchedRoutes(startupPath).matchedRoutes) {
  // A failed load is reported again when the router itself loads the route.
  router.loadRouteChunk(route)?.catch(() => undefined);
}

registerPWA();

// A page restored from the back-forward cache (e.g. via the back button after
// signing out) shows the pre-logout state and skips route guards; reload it so
// the session check runs again.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});

setUnauthorizedCallback(() => {
  window.location.href = "/login";
});

const initialLocale = usePreferencesStore.getState().locale;
document.documentElement.lang = initialLocale;
void preloadLocaleMessages(initialLocale);
usePreferencesStore.subscribe((state) => {
  document.documentElement.lang = state.locale;
  void preloadLocaleMessages(state.locale);
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <RouterProvider router={router} />
        <Toaster position="top-center" />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
