// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { itemAPI, type Feed, type Item } from "@/lib/api";
import { useArticleViewState } from "./use-article-view-state";

const url = vi.hoisted(() => ({ selectedArticleId: 1 as number | null }));
vi.mock("@/hooks/use-url-state", () => ({
  useUrlState: () => ({
    selectedArticleId: url.selectedArticleId,
    selectedFeedId: 7,
    selectedGroupId: null,
    articleFilter: "all",
    setSelectedArticle: () => {},
    setSelectedFeed: () => {},
  }),
}));

const articles = [1, 2].map(
  (id) =>
    ({
      id,
      feed_id: 7,
      title: `Example article ${id}`,
      link: `https://example.com/post-${id}`,
      unread: false,
    }) as Item,
);
vi.mock("@/hooks/use-article-list", () => ({
  useArticleList: () => ({
    articles,
    articleIds: [1, 2],
    indexById: new Map([
      [1, 0],
      [2, 1],
    ]),
    isStarredMode: false,
    isItemStarred: () => false,
    getBookmarkByItemId: () => null,
  }),
}));
vi.mock("@/hooks/use-keyboard", () => ({
  useArticleNavigation: () => ({
    goToNext: () => {},
    goToPrevious: () => {},
    hasNext: false,
    hasPrevious: false,
  }),
}));
vi.mock("@/hooks/use-auto-mark-read", () => ({ useAutoMarkRead: () => {} }));
vi.mock("@/queries/items", () => ({
  useItem: () => ({ data: undefined }),
  useMarkItemsRead: () => ({ mutate: () => {}, isPending: false }),
  useMarkItemsUnread: () => ({ isPending: false }),
}));
vi.mock("@/queries/bookmarks", () => ({
  useCreateBookmark: () => ({}),
  useDeleteBookmark: () => ({}),
}));
vi.mock("@/queries/feeds", () => ({
  useFeedLookup: () => ({
    getFeedById: () =>
      ({ id: 7, default_view: "full", open_permalink: false }) as Feed,
  }),
}));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: { getFullContent: vi.fn(), pageUrl: () => "" },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

afterEach(() => {
  cleanup();
  url.selectedArticleId = 1;
});

const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

async function openFailingArticles() {
  vi.mocked(itemAPI.getFullContent).mockRejectedValue(new Error("boom"));
  const hook = renderHook(() => useArticleViewState());
  await settle();
  return hook;
}

describe("full-text fallback on a feed whose default view is full", () => {
  // After the first article's fetch fails, the view must leave the empty full state.
  it("stops loading after the first article's failure", async () => {
    const { result } = await openFailingArticles();
    expect(result.current.loadingFullText).toBe(false);
  });

  // A second article of the same feed that also fails must stop loading too.
  it("stops loading after the second article's failure", async () => {
    const { result, rerender } = await openFailingArticles();
    url.selectedArticleId = 2;
    rerender();
    await settle();
    expect(itemAPI.getFullContent).toHaveBeenCalledWith(2);
    expect(result.current.loadingFullText).toBe(false);
  });
});
