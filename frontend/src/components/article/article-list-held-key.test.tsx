// @vitest-environment jsdom
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import type { Item } from "@/lib/api";
import { useArticleNavigation } from "@/hooks/use-keyboard";
import { usePreferencesStore } from "@/store/preferences";
import { useNavHighlightStore } from "@/store/nav-highlight";
import { ArticleList } from "./article-list";

function make(id: number) {
  return { id, feed_id: 1, title: `Tide tables for March ${id}`, unread: true } as Item;
}

const { setSelectedArticle, fetchNextPage, mutateAsync, noop, state, urlListeners } = vi.hoisted(() => ({
  setSelectedArticle: vi.fn(),
  fetchNextPage: vi.fn(),
  mutateAsync: vi.fn(() => Promise.resolve()),
  noop: vi.fn(),
  state: {
    articles: [] as Item[],
    hasMore: false,
    selectedArticleId: 2 as number | null,
  },
  urlListeners: new Set<() => void>(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useSearch: ({ select }: { select: (s: unknown) => unknown }) =>
    useSyncExternalStore(
      (listener) => {
        urlListeners.add(listener);
        return () => urlListeners.delete(listener);
      },
      () => select({ article: state.selectedArticleId ?? undefined }),
    ),
}));
vi.mock("@/lib/deferred-scope-read", () => ({
  useDeferredScopeRead: () => vi.fn(),
  undoDeferredRead: vi.fn(),
}));
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
vi.mock("./show-filtered-toggle", () => ({ ShowFilteredToggle: () => null }));
vi.mock("./new-articles-pill", () => ({ NewArticlesPill: () => null }));
vi.mock("@/components/layout/sidebar-trigger", () => ({ SidebarTrigger: () => null }));
vi.mock("@/components/common/tooltip-button", () => ({ TooltipButton: () => null }));

// jsdom has no layout, scrollTo or scrollIntoView.
Element.prototype.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  state.articles = [1, 2, 3, 4, 5, 6].map(make);
  state.hasMore = false;
  state.selectedArticleId = 2;
  usePreferencesStore.setState({ autoMarkRead: "open" });
});

afterEach(() => {
  act(() => {
    vi.runOnlyPendingTimers();
  });
  cleanup();
  vi.useRealTimers();
  setSelectedArticle.mockClear();
  fetchNextPage.mockClear();
  mutateAsync.mockClear();
  useNavHighlightStore.setState({ id: null });
});

// Mounts the list plus the navigation instance the drawer has while an article
// is open, which is the one that handles j and k.
function mount() {
  const view = render(<ArticleList />);
  const drawer = renderHook(() =>
    useArticleNavigation(
      state.articles.map((a) => a.id),
      { enabled: true },
    ),
  );
  return {
    // The URL catches up with what setSelectedArticle asked for.
    syncUrl(id: number) {
      state.selectedArticleId = id;
      act(() => {
        urlListeners.forEach((l) => l());
        view.rerender(<ArticleList />);
        drawer.rerender();
      });
    },
    rerender() {
      act(() => {
        view.rerender(<ArticleList />);
        drawer.rerender();
      });
    },
    highlightedIds() {
      return [
        ...view.container.querySelectorAll<HTMLElement>('[role="button"].group.bg-accent'),
      ].map((row) => Number(row.dataset.articleId));
    },
  };
}

function key(type: "keydown" | "keyup", name: string, repeat = false) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent(type, { key: name, repeat, bubbles: true }));
  });
}

describe.each([
  { name: "j", start: 2, firstOpens: 3, passed: [4, 5], lands: 6, presses: 3 },
  { name: "k", start: 5, firstOpens: 4, passed: [3, 2], lands: 1, presses: 4 },
])("held $name", ({ name, start, firstOpens, passed, lands, presses }) => {
  it("opens at once on the first press, then moves only the highlight until keyup", () => {
    state.selectedArticleId = start;
    const list = mount();

    key("keydown", name);
    expect(setSelectedArticle).toHaveBeenCalledExactlyOnceWith(firstOpens);
    list.syncUrl(firstOpens);
    expect(list.highlightedIds()).toEqual([firstOpens]);

    // Repeats past the end stop on the last row instead of skipping.
    for (let i = 0; i < presses; i++) key("keydown", name, true);
    expect(setSelectedArticle).toHaveBeenCalledTimes(1);
    expect(list.highlightedIds()).toEqual([lands]);
    expect(mutateAsync).not.toHaveBeenCalled();

    key("keyup", name);
    expect(setSelectedArticle).toHaveBeenLastCalledWith(lands);
    expect(setSelectedArticle).toHaveBeenCalledTimes(2);
    // The highlight stays until the URL shows the article, so it does not flash back.
    expect(list.highlightedIds()).toEqual([lands]);
    list.syncUrl(lands);
    expect(useNavHighlightStore.getState().id).toBeNull();
    expect(list.highlightedIds()).toEqual([lands]);

    // Every row passed counts as opened: one request, not one per repeat.
    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith(passed);
  });

  it("opens the highlighted row by itself when the keyup is lost", () => {
    state.selectedArticleId = start;
    const list = mount();
    key("keydown", name);
    list.syncUrl(firstOpens);
    key("keydown", name, true);
    key("keydown", name, true);
    expect(setSelectedArticle).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(setSelectedArticle).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(setSelectedArticle).toHaveBeenCalledTimes(2);
    key("keyup", name);
    expect(setSelectedArticle).toHaveBeenCalledTimes(2);
  });
});

describe("held key and auto mark-read", () => {
  it("marks nothing when auto mark-read is not on open", () => {
    usePreferencesStore.setState({ autoMarkRead: "5" });
    mount().syncUrl(2);
    key("keydown", "j");
    key("keydown", "j", true);
    key("keydown", "j", true);
    key("keyup", "j");
    expect(setSelectedArticle).toHaveBeenLastCalledWith(5);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("skips rows that are already read", () => {
    state.articles = [1, 2, 3, 4, 5, 6].map((id) => ({ ...make(id), unread: id !== 4 }));
    mount();
    key("keydown", "j");
    for (let i = 0; i < 3; i++) key("keydown", "j", true);
    key("keyup", "j");
    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith([5]);
  });

  it("does not leave an unhandled rejection when the batched mark fails", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("offline"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    key("keydown", "j");
    key("keydown", "j", true);
    key("keydown", "j", true);
    key("keyup", "j");
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});

describe("held j and paging", () => {
  // The look-ahead and "j at the last loaded row loads more" keep working: the
  // highlight steps onto the first article of the page that lands.
  it("loads the next page at the last row and moves the highlight onto it", () => {
    state.hasMore = true;
    state.selectedArticleId = 5;
    const list = mount();
    key("keydown", "j");
    list.syncUrl(6);
    fetchNextPage.mockClear();

    key("keydown", "j", true);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(setSelectedArticle).toHaveBeenCalledTimes(1);

    // The page lands under the held key: the highlight steps onto its first
    // article without going through the URL, and the next repeat moves on.
    state.articles = [...state.articles, make(7), make(8)];
    list.rerender();
    expect(list.highlightedIds()).toEqual([7]);
    key("keydown", "j", true);
    expect(setSelectedArticle).toHaveBeenCalledTimes(1);
    expect(list.highlightedIds()).toEqual([8]);
    key("keyup", "j");
    expect(setSelectedArticle).toHaveBeenLastCalledWith(8);
    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith([7]);
  });
});
