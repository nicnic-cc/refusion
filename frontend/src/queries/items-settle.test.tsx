// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { itemAPI, type Feed, type Item } from "@/lib/api";
import { queryKeys } from "./keys";
import { useFeeds } from "./feeds";
import { useItems, useMarkItemsRead, useMarkScopeRead } from "./items";

// A cursor "n" names page n; page 1 waits on `gate.release` when set.
const gate: { release: () => void; wait: Promise<void> | null } = {
  release: () => {},
  wait: null,
};

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: {
    markRead: vi.fn(async () => {}),
    markScopeRead: vi.fn(async () => {}),
    list: vi.fn(async (params: { before?: string }) => {
      const n = Number(params.before ?? 0);
      if (n === 1) await gate.wait;
      return {
        data: [{ id: 10 + n, feed_id: 1, unread: true, filtered: false }],
        next_cursor: n < 1 ? "1" : null,
        snapshot_id: 1,
      };
    }),
  },
  // /feeds never answers: the mutation must not wait for it.
  feedAPI: { list: vi.fn(() => new Promise(() => {})) },
}));

const tomato = {
  id: 5,
  feed_id: 1,
  title: "Tomato trellis basics",
  unread: true,
  filtered: false,
} as Item;
const compost = {
  id: 6,
  feed_id: 2,
  title: "Compost tea myths",
  unread: true,
  filtered: false,
} as Item;
const page = (data: Item[]) => ({
  pages: [{ data, total: data.length, next_cursor: null }],
  pageParams: [null],
});
const feeds = [
  { id: 1, name: "Garden Notes", unread_count: 3 } as Feed,
  { id: 2, name: "Soil Weekly", unread_count: 2 } as Feed,
];

function setup() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("mark-read optimistic update", () => {
  // Rebuilding untouched lists would re-render every list on each mark.
  function seed() {
    const { qc, wrapper } = setup();
    const other = [...queryKeys.items.lists(), { feedId: 2 }, 50];
    const holder = [...queryKeys.items.lists(), { feedId: 1 }, 50];
    const otherData = page([compost]);
    qc.setQueryData(other, otherData);
    qc.setQueryData(holder, page([tomato]));
    const expectOnlyHolderChanged = () => {
      expect(qc.getQueryData(other)).toBe(otherData);
      expect(
        qc.getQueryData<ReturnType<typeof page>>(holder)?.pages[0].data[0].unread,
      ).toBe(false);
    };
    return { wrapper, expectOnlyHolderChanged };
  }

  it("useMarkItemsRead keeps a cached list without the item as the same object", async () => {
    const { wrapper, expectOnlyHolderChanged } = seed();
    const { result } = renderHook(() => useMarkItemsRead(), { wrapper });
    await act(() => result.current.mutateAsync([5]));
    expectOnlyHolderChanged();
  });

  it("useMarkScopeRead keeps a cached list without the item as the same object", async () => {
    const { wrapper, expectOnlyHolderChanged } = seed();
    const { result } = renderHook(() => useMarkScopeRead(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ request: { max_id: 10 }, loadedIds: [5] }),
    );
    expectOnlyHolderChanged();
  });

  // A page of the same list that holds no marked row keeps its identity too.
  it("keeps an untouched page of a list that holds the item elsewhere", async () => {
    const { qc, wrapper } = setup();
    const key = [...queryKeys.items.lists(), {}, 50];
    const untouched = { data: [compost], total: 2, next_cursor: "x" };
    qc.setQueryData(key, {
      pages: [{ data: [tomato], total: 2, next_cursor: "x" }, untouched],
      pageParams: [null, "x"],
    });

    const { result } = renderHook(() => useMarkItemsRead(), { wrapper });
    await act(() => result.current.mutateAsync([5]));

    const data = qc.getQueryData<ReturnType<typeof page>>(key)!;
    expect(data.pages[0].data[0].unread).toBe(false);
    expect(data.pages[1]).toBe(untouched);
  });
});

describe("mark-read settling", () => {
  // The auto-mark-read hook retries while a mutation is pending.
  it("useMarkItemsRead settles while the /feeds refetch is still pending", async () => {
    const { qc, wrapper } = setup();
    qc.setQueryData(queryKeys.feeds.list(), feeds);

    const { result } = renderHook(
      () => ({ mark: useMarkItemsRead(), feeds: useFeeds() }),
      { wrapper },
    );
    act(() => result.current.mark.mutate([5]));

    await waitFor(() => expect(result.current.mark.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.feeds.isFetching).toBe(true));
  });

  it("useMarkScopeRead settles while the /feeds refetch is still pending", async () => {
    const { qc, wrapper } = setup();
    qc.setQueryData(queryKeys.feeds.list(), feeds);

    const { result } = renderHook(
      () => ({ mark: useMarkScopeRead(), feeds: useFeeds() }),
      { wrapper },
    );
    act(() =>
      result.current.mark.mutate({ request: { max_id: 10 }, loadedIds: [5] }),
    );

    await waitFor(() => expect(result.current.mark.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.feeds.isFetching).toBe(true));
  });
});

describe("mark-read cancelling", () => {
  // The next page being read must still land after a mark.
  it("does not cancel an in-flight next-page load of a list", async () => {
    const { wrapper } = setup();
    gate.wait = new Promise<void>((resolve) => (gate.release = resolve));

    const { result } = renderHook(
      () => {
        const items = useItems({});
        // Read in render so the observer tracks it and re-renders.
        const { isFetchingNextPage } = items;
        return { items, isFetchingNextPage, mark: useMarkItemsRead() };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.items.data?.pages).toHaveLength(1));

    act(() => void result.current.items.fetchNextPage());
    await waitFor(() => expect(result.current.isFetchingNextPage).toBe(true));

    await act(() => result.current.mark.mutateAsync([5]));
    expect(result.current.isFetchingNextPage).toBe(true);

    gate.release();
    await waitFor(() => expect(result.current.items.data?.pages).toHaveLength(2));
  });

  // The landing page is built from the pages seen at fetch start, so it
  // would bring the marked row back as unread.
  function mountListWithNextPageInFlight() {
    const { wrapper } = setup();
    gate.wait = new Promise<void>((resolve) => (gate.release = resolve));
    const hook = renderHook(
      () => {
        const items = useItems({});
        const { isFetchingNextPage } = items;
        return { items, isFetchingNextPage, mark: useMarkItemsRead() };
      },
      { wrapper },
    );
    return hook.result;
  }

  async function startNextPage(result: ReturnType<typeof mountListWithNextPageInFlight>) {
    await waitFor(() => expect(result.current.items.data?.pages).toHaveLength(1));
    act(() => void result.current.items.fetchNextPage());
    await waitFor(() => expect(result.current.isFetchingNextPage).toBe(true));
  }

  it("keeps a marked row read when a next page lands afterwards", async () => {
    const result = mountListWithNextPageInFlight();
    await startNextPage(result);

    await act(() => result.current.mark.mutateAsync([10]));
    gate.release();
    await waitFor(() => expect(result.current.items.data?.pages).toHaveLength(2));

    expect(result.current.items.data?.pages[0].data[0].unread).toBe(false);
  });

  it("leaves the row unread when the mark fails before the page lands", async () => {
    const result = mountListWithNextPageInFlight();
    await startNextPage(result);

    vi.mocked(itemAPI.markRead).mockRejectedValueOnce(new Error("offline"));
    await act(() => result.current.mark.mutateAsync([10]).catch(() => {}));
    gate.release();
    await waitFor(() => expect(result.current.items.data?.pages).toHaveLength(2));

    expect(result.current.items.data?.pages[0].data[0].unread).toBe(true);
  });
});
