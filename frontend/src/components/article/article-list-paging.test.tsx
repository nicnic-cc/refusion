// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
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
    articleIds: state.articles.map((a) => a.id),
    indexById: new Map(state.articles.map((a, i) => [a.id, i])),
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

  // Button mode: a key press counts as asking, like clicking the button.
  it("loads the next page on j in button mode", () => {
    usePreferencesStore.setState({ articleLoading: "button" });
    const view = render(<ArticleList />);
    fetchNextPage.mockClear();
    pressJ();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    state.articles = [...state.articles, make(4), make(5)];
    view.rerender(<ArticleList />);
    expect(setSelectedArticle).toHaveBeenCalledExactlyOnceWith(4);
  });

  // Scrolling to the bottom never loads in button mode.
  it("does not load on scroll in button mode", () => {
    vi.useFakeTimers();
    try {
      usePreferencesStore.setState({ articleLoading: "button" });
      state.selectedArticleId = 1;
      const view = render(<ArticleList />);
      const box = view.container.querySelector("[data-slot='scroll-area-viewport']")!;
      Object.defineProperty(box, "scrollHeight", { value: 600 });
      Object.defineProperty(box, "clientHeight", { value: 400 });
      box.dispatchEvent(new Event("scroll"));
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(fetchNextPage).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("article list prefetch", () => {
  const page = () => Array.from({ length: 10 }, (_, i) => make(i + 1));

  // Entering the last loaded page asks for the next one, so j never waits on a fetch.
  it("requests the next page once the selection is in the last loaded page", () => {
    usePreferencesStore.setState({ articlePageSize: 10 });
    state.articles = page();
    state.selectedArticleId = 2;
    render(<ArticleList />);
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it("does not prefetch in button mode", () => {
    usePreferencesStore.setState({ articleLoading: "button", articlePageSize: 10 });
    state.articles = page();
    state.selectedArticleId = 2;
    render(<ArticleList />);
    expect(fetchNextPage).not.toHaveBeenCalled();
  });
});

describe("article list footer reveal", () => {
  // The footer (spinner or Load more) must be visible while the next page loads.
  it("scrolls the footer into view when the last loaded row is selected", () => {
    const view = render(<ArticleList />);
    const footer = scrollIntoView.mock.contexts.at(-1) as HTMLElement;
    expect(footer).toBeDefined();
    expect(footer.contains(view.container.querySelector("svg"))).toBe(true);
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });
  });

  it("leaves the scroll alone when the selection is not the last row", () => {
    state.selectedArticleId = 2;
    render(<ArticleList />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
