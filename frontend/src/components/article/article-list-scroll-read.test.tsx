// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { Item } from "@/lib/api";
import { usePreferencesStore } from "@/store/preferences";
import { ArticleList } from "./article-list";

function make(id: number) {
  return { id, feed_id: 1, title: `Tide tables for March ${id}`, unread: true } as Item;
}

const { setSelectedArticle, fetchNextPage, mutateAsync, noop, state } = vi.hoisted(() => ({
  setSelectedArticle: vi.fn(),
  mutateAsync: vi.fn(() => Promise.resolve()),
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
  useMarkItemsRead: () => ({ mutateAsync }),
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
  ArticleRow: ({ article }: { article: Item }) => (
    <div data-article-id={article.id}>{article.title}</div>
  ),
}));

// jsdom has no layout, scrollTo or scrollIntoView.
Element.prototype.scrollTo = vi.fn();
const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mutateAsync.mockClear();
  usePreferencesStore.setState({ markReadOnScroll: false });
});

const ROW_HEIGHT = 100;

// jsdom has no layout: the scroll box sits at the top of the page and each
// row is ROW_HEIGHT tall, moved up by the box's scrollTop.
function stubLayout(box: HTMLElement) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const id = (this as HTMLElement).dataset?.articleId;
      if (id === undefined) return new DOMRect(0, 0, 1000, 800);
      const index = state.articles.findIndex((a) => a.id === Number(id));
      return new DOMRect(0, index * ROW_HEIGHT - box.scrollTop, 1000, ROW_HEIGHT);
    },
  );
}

function scrollTo(box: HTMLElement, top: number) {
  act(() => {
    box.scrollTop = top;
    box.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(20);
  });
}

describe("article list mark as read on scroll", () => {
  it("marks the unread rows scrolled fully past the top in one request", () => {
    vi.useFakeTimers();
    usePreferencesStore.setState({ markReadOnScroll: true });
    state.hasMore = false;
    state.articles = [make(1), { ...make(2), unread: false }, make(-5), make(3), make(4)];
    const { container } = render(<ArticleList />);
    const box = container.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
    stubLayout(box);

    // Row bottoms sit at 100, 200, ... 500. Down, back up, down again: only
    // rows fully crossed on the way down count, and row 4 is still half visible.
    scrollTo(box, 150);
    scrollTo(box, 350);
    scrollTo(box, 50);
    scrollTo(box, 450);
    expect(mutateAsync).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));

    // 2 is already read. -5 (a starred copy of a deleted item) cannot be marked.
    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith([1, 3]);
    expect(container.textContent).toContain("No more articles");
  });
});
