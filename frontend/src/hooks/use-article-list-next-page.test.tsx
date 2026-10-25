// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useArticleList } from "./use-article-list";

const list = vi.hoisted(() =>
  vi.fn(async (params: { before?: string }) => ({
    data: [{ id: params.before ? 2 : 1, unread: true }],
    next_cursor: params.before ? null : "c1",
  })),
);
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: { list },
}));
vi.mock("@/queries/bookmarks", () => ({
  indexBookmarks: () => () => undefined,
  useBookmarkLookup: () => ({ bookmarks: [] }),
  useStarredItems: () => ({ items: [], bookmarks: [] }),
}));
vi.mock("@/hooks/use-show-filtered", () => ({
  useIncludeFiltered: () => false,
}));

afterEach(cleanup);

describe("useArticleList next page", () => {
  // Look-ahead and a key press can both ask for the next page in one tick.
  it("requests a page once when asked twice", async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useArticleList({ feedId: null, groupId: null, articleFilter: "all" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    act(() => {
      result.current.fetchNextPage();
      result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.articles).toHaveLength(2));
    expect(list).toHaveBeenCalledTimes(2);
  });
});
