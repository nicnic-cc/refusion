// @vitest-environment jsdom
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { itemAPI, pullAPI, type PullStatus } from "@/lib/api";
import { itemQueries, useItems } from "@/queries/items";
import { applyPullStatus, pullQueryKey } from "@/queries/pull";
import { usePreferencesStore } from "@/store";
import { usePullStore } from "@/store/pull";
import { useNewArticles } from "./use-new-articles";

const BIRDWATCHING = 7;
const OTHER_GROUP = 8;

// A cursor "n" names page n; every list has 30 pages.
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: {
    list: vi.fn(async (params: { before?: string }) => {
      const n = Number(params.before ?? 0);
      return {
        data: [{ id: 1000 - n }],
        next_cursor: n < 29 ? String(n + 1) : null,
        snapshot_id: 10,
      };
    }),
  },
  pullAPI: {
    status: vi.fn(),
    newCount: vi.fn(async () => ({ data: { count: 4 } })),
  },
  feedFilterAPI: { list: async () => ({ data: [] }) },
  hiddenCountsAPI: { get: async () => ({ data: {} }) },
}));

const idle: PullStatus = { pending: [], new_items: 0, last_item_id: 10 };
const afterCheck: PullStatus = { pending: [], new_items: 4, last_item_id: 14 };

function setup(staleTime = 0) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime } } });
  qc.setQueryData(pullQueryKey, idle);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const scroller = document.createElement("div");
  let scrollTop = 0;
  Object.defineProperty(scroller, "scrollTop", {
    get: () => scrollTop,
    set: (v: number) => (scrollTop = v),
  });
  const scrollTo = (top: number) => {
    scrollTop = top;
    scroller.dispatchEvent(new Event("scroll"));
  };
  const view = renderHook(
    () => ({
      items: useItems({ groupId: BIRDWATCHING, unread: true }),
      pill: useNewArticles({
        feedId: null,
        groupId: BIRDWATCHING,
        articleFilter: "unread",
        articleCount: 1,
        scrollRef: { current: scroller },
      }),
    }),
    { wrapper },
  );
  return { qc, view, scrollTo };
}

async function loadPages(view: ReturnType<typeof setup>["view"], n: number) {
  await waitFor(() => expect(view.result.current.items.data?.pages).toHaveLength(1));
  for (let i = 2; i <= n; i++) {
    act(() => void view.result.current.items.fetchNextPage());
    await waitFor(() =>
      expect(view.result.current.items.data?.pages).toHaveLength(i),
    );
  }
}

// A run seen by the status poll: pending feeds first, then none.
async function endRun(qc: QueryClient) {
  await act(async () => {
    applyPullStatus(qc, { pending: [1], new_items: 0, last_item_id: 10 });
    qc.setQueryData(pullQueryKey, afterCheck);
    applyPullStatus(qc, afterCheck);
  });
}

beforeEach(() => {
  usePullStore.getState().reset();
  usePullStore.setState({ listAtTop: true });
  vi.mocked(itemAPI.list).mockClear();
  vi.mocked(pullAPI.newCount).mockClear();
});

describe("a finished feed check", () => {
  // The Birdwatching reader has 3 pages loaded and is scrolled down.
  it("leaves a scrolled, multi-page list alone and counts the new articles", async () => {
    const { qc, view, scrollTo } = setup();
    await loadPages(view, 3);
    scrollTo(900);

    vi.mocked(itemAPI.list).mockClear();
    await endRun(qc);

    await waitFor(() => expect(view.result.current.pill.newCount).toBe(4));
    expect(itemAPI.list).not.toHaveBeenCalled();
    expect(view.result.current.items.data?.pages).toHaveLength(3);
    expect(pullAPI.newCount).toHaveBeenCalled();
  });

  it("reloads a one-page list at the top in place, with one request", async () => {
    const { qc, view } = setup();
    await loadPages(view, 1);

    vi.mocked(itemAPI.list).mockClear();
    await endRun(qc);

    await waitFor(() => expect(itemAPI.list).toHaveBeenCalledTimes(1));
    expect(view.result.current.items.data?.pages).toHaveLength(1);
  });

  it("marks a list that is not open stale, so opening it loads once", async () => {
    const { qc, view } = setup(Infinity);
    await loadPages(view, 1);
    await qc.fetchInfiniteQuery(
      itemQueries.list(
        { groupId: OTHER_GROUP, unread: true },
        usePreferencesStore.getState().articlePageSize,
      ),
    );

    vi.mocked(itemAPI.list).mockClear();
    await endRun(qc);
    // Only the open one-page list reloads; the closed one waits.
    await waitFor(() => expect(itemAPI.list).toHaveBeenCalledTimes(1));

    vi.mocked(itemAPI.list).mockClear();
    const other = renderHook(
      () => useItems({ groupId: OTHER_GROUP, unread: true }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(other.result.current.isFetching).toBe(false));
    expect(itemAPI.list).toHaveBeenCalledTimes(1);
  });
});
