// @vitest-environment jsdom
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { itemAPI } from "@/lib/api";
import { useArticleList } from "@/hooks/use-article-list";
import { prefetchItemList } from "./items";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: { list: vi.fn() },
  feedFilterAPI: { list: vi.fn(async () => ({ data: [] })) },
  bookmarkAPI: {
    list: vi.fn(async () => ({ data: [], total: 0, next_cursor: null })),
  },
}));

const TIDE_FEED = 41;

function renderList(qc: QueryClient, articleFilter: "unread" | "starred") {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => useArticleList({ feedId: TIDE_FEED, groupId: null, articleFilter }),
    { wrapper },
  );
}

describe("prefetchItemList", () => {
  beforeEach(() => {
    vi.mocked(itemAPI.list).mockReset();
    // Slow enough that the request is still in flight when the list mounts.
    vi.mocked(itemAPI.list).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return {
        data: [{ id: 7, title: "Spring tide table", unread: true }],
        next_cursor: null,
        snapshot_id: 1,
      } as never;
    });
  });

  // The list opened after a prefetch joins the request instead of sending its own.
  it("lets the unread list reuse the in-flight request", async () => {
    const qc = new QueryClient();
    prefetchItemList(qc, { feedId: TIDE_FEED, groupId: null }, "unread");
    const { result } = renderList(qc, "unread");

    await waitFor(() => expect(result.current.articles).toHaveLength(1));
    expect(itemAPI.list).toHaveBeenCalledTimes(1);
    expect(itemAPI.list).toHaveBeenCalledWith(
      expect.objectContaining({ feed_id: TIDE_FEED, unread: true }),
    );
  });

  it("makes no items request for the starred view", async () => {
    const qc = new QueryClient();
    prefetchItemList(qc, { feedId: TIDE_FEED, groupId: null }, "starred");

    expect(itemAPI.list).not.toHaveBeenCalled();
    expect(qc.isFetching()).toBe(0);
  });
});
