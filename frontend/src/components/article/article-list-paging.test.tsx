// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook } from "@testing-library/react";
import type { Item } from "@/lib/api";
import { useArticleNavigation } from "@/hooks/use-keyboard";
import { ArticleList } from "./article-list";

function make(id: number) {
  return { id, feed_id: 1, title: `Tide tables for March ${id}`, unread: true } as Item;
}

const { setSelectedArticle, fetchNextPage, noop, state } = vi.hoisted(() => ({
  setSelectedArticle: vi.fn(),
  fetchNextPage: vi.fn(),
  noop: vi.fn(),
  state: {
    articles: [] as Item[],
    hasMore: true,
    selectedArticleId: 3 as number | null,
  },
}));
state.articles = [make(1), make(2), make(3)];

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/queries/pull", () => ({ useStartPull: () => ({ mutate: vi.fn() }) }));
vi.mock("@/hooks/use-url-state", () => ({
  useUrlState: () => ({
    articleFilter: "all",
    setArticleFilter: noop,
    selectedFeedId: null,
    selectedGroupId: null,
    selectedArticleId: state.selectedArticleId,
    setSelectedArticle,
  }),
}));
vi.mock("@/hooks/use-article-list", () => ({
  useArticleList: () => ({
    articles: state.articles,
    hasMore: state.hasMore,
    isLoading: false,
    isLoadingMore: false,
    isFetchNextPageError: false,
    fetchNextPage,
    isItemStarred: () => false,
    getBookmarkByItemId: () => undefined,
  }),
}));
vi.mock("@/queries/groups", () => ({ useGroups: () => ({ data: [] }) }));
vi.mock("@/queries/feeds", () => ({
  useFeedLookup: () => ({
    feeds: [{ id: 1, unread_count: 3 }],
    getFeedById: () => undefined,
    isLoading: false,
  }),
}));
vi.mock("@/queries/items", () => ({
  useMarkItemsRead: () => ({}),
  useMarkItemsUnread: () => ({}),
  useMarkScopeRead: () => ({}),
}));
vi.mock("@/queries/bookmarks", () => ({
  useCreateBookmark: () => ({}),
  useDeleteBookmark: () => ({}),
}));
vi.mock("@/hooks/use-list-pull", () => ({ useListPull: () => ({}) }));
vi.mock("@/hooks/use-new-articles", () => ({
  useNewArticles: () => ({
    newCount: 0,
    showNew: noop,
    freshAfter: null,
    snapshotId: null,
  }),
}));
vi.mock("@/hooks/use-mark-all-read-shortcut", () => ({
  useMarkAllReadShortcut: noop,
}));
vi.mock("@/components/feed/pull-indicator", () => ({ PullIndicator: () => null }));
vi.mock("./feed-error-line", () => ({ FeedErrorLine: () => null }));
vi.mock("./article-filter-switch", () => ({ ArticleFilterSwitch: () => null }));
vi.mock("./show-filtered-toggle", () => ({ ShowFilteredToggle: () => null }));
vi.mock("./new-articles-pill", () => ({ NewArticlesPill: () => null }));
vi.mock("@/components/layout/sidebar-trigger", () => ({ SidebarTrigger: () => null }));
vi.mock("@/components/common/tooltip-button", () => ({ TooltipButton: () => null }));
vi.mock("./article-item", () => ({
  ArticleItem: ({ article }: { article: Item }) => <div>{article.title}</div>,
}));

// jsdom has no layout or scrollTo.
Element.prototype.scrollTo = vi.fn();

afterEach(() => {
  cleanup();
  setSelectedArticle.mockClear();
  fetchNextPage.mockClear();
  state.articles = [make(1), make(2), make(3)];
  state.hasMore = true;
  state.selectedArticleId = 3;
});

// The drawer's navigation instance handles j while an article is open.
function pressJ() {
  renderHook(() =>
    useArticleNavigation(
      state.articles.map((a) => a.id),
      { enabled: true },
    ),
  );
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
}

describe("article list paging with j", () => {
  // j on the last loaded row must ask for the next page, then land on its first article.
  it("requests the next page and selects the first new article", () => {
    const view = render(<ArticleList />);
    fetchNextPage.mockClear();
    pressJ();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(setSelectedArticle).not.toHaveBeenCalled();

    state.articles = [...state.articles, make(4), make(5)];
    view.rerender(<ArticleList />);
    expect(setSelectedArticle).toHaveBeenCalledExactlyOnceWith(4);
  });

  // A pending step is dropped when the selection moves away before the page lands.
  it("drops the pending step when the selection changes", () => {
    const view = render(<ArticleList />);
    pressJ();
    state.selectedArticleId = null;
    state.articles = [...state.articles, make(4)];
    view.rerender(<ArticleList />);
    expect(setSelectedArticle).not.toHaveBeenCalled();
  });
});
