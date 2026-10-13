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
  state.articleFilter = "all";
});

// The drawer's navigation instance handles j while an article is open.
function pressJ() {
  renderHook(() =>
    useArticleNavigation(
      state.articles.map((a) => a.id),
      { enabled: true },
    ),
  );
  keyJ();
}

function keyJ() {
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

describe("article list j with the open article missing", () => {
  const rows = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => make(from + i));

  // The list reset to page 1 while article 45 (page 3) is open: j pages in, then steps past it.
  it("loads pages until the open article returns, then selects the next row", () => {
    state.articles = rows(1, 20);
    state.selectedArticleId = 45;
    const view = render(<ArticleList />);
    fetchNextPage.mockClear();

    pressJ();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    keyJ();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    state.articles = rows(1, 40);
    view.rerender(<ArticleList />);
    expect(fetchNextPage).toHaveBeenCalledTimes(2);
    expect(setSelectedArticle).not.toHaveBeenCalled();

    state.articles = rows(1, 60);
    view.rerender(<ArticleList />);
    expect(setSelectedArticle).toHaveBeenCalledExactlyOnceWith(46);
  });

  // Button mode: the key press counts as asking.
  it("pages in on j in button mode too", () => {
    usePreferencesStore.setState({ articleLoading: "button" });
    state.articles = rows(1, 20);
    state.selectedArticleId = 45;
    render(<ArticleList />);
    fetchNextPage.mockClear();
    pressJ();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("gives up after 20 pages and selects the first row", () => {
    state.articles = rows(1, 20);
    state.selectedArticleId = 9999;
    const view = render(<ArticleList />);
    fetchNextPage.mockClear();
    pressJ();
    for (let n = 2; n <= 20; n++) {
      state.articles = rows(1, n * 20);
      view.rerender(<ArticleList />);
      expect(fetchNextPage).toHaveBeenCalledTimes(n);
    }
    expect(setSelectedArticle).not.toHaveBeenCalled();

    state.articles = rows(1, 21 * 20);
    view.rerender(<ArticleList />);
    expect(fetchNextPage).toHaveBeenCalledTimes(20);
    expect(setSelectedArticle).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("selects the first row when the list ends without the article", () => {
    state.articles = rows(1, 20);
    state.selectedArticleId = 9999;
    const view = render(<ArticleList />);
    pressJ();
    state.articles = rows(1, 25);
    state.hasMore = false;
    view.rerender(<ArticleList />);
    expect(setSelectedArticle).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("drops the search when the selection changes", () => {
    state.articles = rows(1, 20);
    state.selectedArticleId = 45;
    const view = render(<ArticleList />);
    pressJ();
    state.selectedArticleId = 7;
    view.rerender(<ArticleList />);
    state.articles = rows(1, 60);
    view.rerender(<ArticleList />);
    expect(setSelectedArticle).not.toHaveBeenCalled();
  });

  // In unread the open article was read away: the top row is the next unread.
  it("selects the first row and loads nothing in the unread view", () => {
    state.articleFilter = "unread";
    state.articles = rows(1, 20);
    state.selectedArticleId = 45;
    render(<ArticleList />);
    fetchNextPage.mockClear();
    pressJ();
    expect(fetchNextPage).not.toHaveBeenCalled();
    expect(setSelectedArticle).toHaveBeenCalledExactlyOnceWith(1);
  });
});
