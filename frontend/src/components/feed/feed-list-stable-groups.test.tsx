// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { Feed } from "@/lib/api";
import { queryKeys } from "@/queries/keys";
import { FeedList } from "./feed-list";

// FeedList calls useUrlState once per render and FeedGroup calls
// useIsGroupSelected once per render, so the counts are render counts.
const renders = vi.hoisted(() => ({
  list: 0,
  groups: {} as Record<number, number>,
}));
const urlState = vi.hoisted(() => ({
  selectedFeedId: null as number | null,
  selectedGroupId: null as number | null,
  articleFilter: "all",
  selectAllFeeds: () => {},
}));
const noBookmarks = vi.hoisted(() => ({ total: 0, bookmarks: [] }));
vi.mock("@/hooks/use-url-state", () => ({
  useUrlState: () => {
    renders.list++;
    return urlState;
  },
  useUrlActions: () => ({
    selectAllFeeds: () => {},
    setSelectedGroup: () => {},
    setSelectedFeed: () => {},
  }),
  useIsFeedSelected: () => false,
  useIsGroupSelected: (id: number) => {
    renders.groups[id] = (renders.groups[id] ?? 0) + 1;
    return false;
  },
}));
vi.mock("@/hooks/use-prefetch-list", () => ({ usePrefetchList: () => () => {} }));
vi.mock("@/queries/bookmarks", () => ({ useBookmarkLookup: () => noBookmarks }));
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  useLocation: () => "/all",
}));

const feed = (id: number, group_id: number, unread_count: number) =>
  ({
    id,
    group_id,
    name: `Feed ${id}`,
    unread_count,
    fetch_state: {},
  }) as Feed;
const original = [feed(10, 6, 3), feed(11, 6, 4), feed(12, 7, 9)];

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  groupAPI: {
    list: vi.fn(async () => ({
      data: [
        { id: 6, name: "Tech" },
        { id: 7, name: "News" },
      ],
    })),
  },
  feedAPI: { list: vi.fn(async () => ({ data: original })) },
}));

beforeAll(() => {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

describe("FeedList when one feed's unread count changes", () => {
  it("re-renders only that feed's folder, once, and a rollback restores the counts", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity } },
    });
    render(
      <QueryClientProvider client={qc}>
        <FeedList />
      </QueryClientProvider>,
    );
    await screen.findByText("Tech");
    await screen.findByText("Feed 10");
    expect(screen.queryByText("7")).not.toBeNull();

    const listBefore = renders.list;
    const techBefore = renders.groups[6];
    const newsBefore = renders.groups[7];
    act(() => {
      qc.setQueryData(queryKeys.feeds.list(), (old: Feed[] | undefined) =>
        old?.map((f) => (f.id === 10 ? { ...f, unread_count: 2 } : f)),
      );
    });
    await screen.findByText("6");
    expect(renders.groups[7]).toBe(newsBefore);
    expect(renders.groups[6]).toBe(techBefore + 1);
    expect(renders.list).toBe(listBefore + 1);

    // A failed mark rolls the cache back to the earlier snapshot.
    act(() => {
      qc.setQueryData(queryKeys.feeds.list(), structuredClone(original));
    });
    await screen.findByText("7");
    expect(screen.queryByText("6")).toBeNull();
    expect(screen.getByText("3")).not.toBeNull();
    expect(screen.queryByText("2")).toBeNull();
  });
});
