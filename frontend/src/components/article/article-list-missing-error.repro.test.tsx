// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook } from "@testing-library/react";
import type { Item } from "@/lib/api";
import { useArticleNavigation } from "@/hooks/use-keyboard";
import { usePreferencesStore } from "@/store/preferences";
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
    isFetchNextPageError: false,
    selectedArticleId: 3 as number | null,
    articleFilter: "all",
  },
}));
state.articles = [make(1), make(2), make(3)];

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/deferred-scope-read", () => ({
  useDeferredScopeRead: () => vi.fn(),
  undoDeferredRead: vi.fn(),
}));
vi.mock("@/queries/pull", () => ({ useStartPull: () => ({ mutate: vi.fn() }) }));
vi.mock("@/hooks/use-url-state", () => ({
  useUrlState: () => ({
    articleFilter: state.articleFilter,
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
    articleIds: state.articles.map((a) => a.id),
    indexById: new Map(state.articles.map((a, i) => [a.id, i])),
    hasMore: state.hasMore,
    isLoading: false,
    isLoadingMore: false,
    isFetchNextPageError: state.isFetchNextPageError,
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
  ArticleRow: ({ article }: { article: Item }) => <div>{article.title}</div>,
}));

// jsdom has no layout, scrollTo or scrollIntoView.
Element.prototype.scrollTo = vi.fn();
const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;

afterEach(() => {
  cleanup();
  setSelectedArticle.mockClear();
  fetchNextPage.mockClear();
  scrollIntoView.mockClear();
  usePreferencesStore.setState({ articleLoading: "scroll", articlePageSize: 20 });
  state.articles = [make(1), make(2), make(3)];
  state.hasMore = true;
  state.isFetchNextPageError = false;
  state.selectedArticleId = 3;
  state.articleFilter = "all";
});

// The list's own navigation instance handles j when no article is open; the drawer's when one is.
function pressJ() {
  renderHook(() =>
    useArticleNavigation(
      state.articles.map((a) => a.id),
      { enabled: true },
    ),
  );
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
}

describe("article list j with the open article missing after a failed page", () => {
  // The open article is gone from the loaded rows and the last page fetch failed:
  // j must give up on paging and select the first row, not do nothing.
  it("selects the first row when the next-page fetch already failed", () => {
    state.isFetchNextPageError = true;
    state.selectedArticleId = 99;
    render(<ArticleList />);
    pressJ();
    expect(setSelectedArticle).toHaveBeenCalledExactlyOnceWith(1);
  });

  // Control: without the error, j pages in for the missing article.
  it("requests the next page when no fetch has failed", () => {
    state.selectedArticleId = 99;
    render(<ArticleList />);
    fetchNextPage.mockClear();
    pressJ();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
