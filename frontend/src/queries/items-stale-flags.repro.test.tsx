// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { Item } from "@/lib/api";
import { queryKeys } from "./keys";
import { useMarkItemsRead } from "./items";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: { markRead: vi.fn(async () => {}) },
}));

const row = (id: number) =>
  ({ id, feed_id: 1, unread: true, filtered: false }) as Item;
const itemsPage = (rows: Item[]) => ({
  pages: [{ data: rows, total: rows.length, next_cursor: null }],
  pageParams: [null],
});
const bookmarksPage = (itemIds: number[]) => ({
  pages: [
    {
      data: itemIds.map((item_id) => ({ id: item_id, item_id, unread: true })),
      total: itemIds.length,
      next_cursor: null,
    },
  ],
  pageParams: [null],
});

describe("useMarkItemsRead stale flags", () => {
  // Lists that do not hold the marked item keep their invalidated flag.
  it("keeps an invalidated items list and bookmark list invalidated when they lack the item", async () => {
    const qc = new QueryClient();
    const listA = [...queryKeys.items.lists(), { feedId: 2 }, 50];
    const bookmarks = [...queryKeys.bookmarks.lists(), { feedId: 1 }, 50];
    qc.setQueryData(listA, itemsPage([row(1)]));
    qc.setQueryData(bookmarks, bookmarksPage([2]));
    await qc.invalidateQueries({ queryKey: queryKeys.items.all, refetchType: "none" });
    await qc.invalidateQueries({ queryKey: queryKeys.bookmarks.all, refetchType: "none" });
    expect(qc.getQueryState(listA)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(bookmarks)?.isInvalidated).toBe(true);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMarkItemsRead(), { wrapper });
    await act(() => result.current.mutateAsync([99]));

    expect(qc.getQueryState(listA)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(bookmarks)?.isInvalidated).toBe(true);
  });

  // Control: a list holding the item has its row flipped to read.
  it("control: flips the row in a list that holds the item", async () => {
    const qc = new QueryClient();
    const holder = [...queryKeys.items.lists(), {}, 50];
    qc.setQueryData(holder, itemsPage([row(99)]));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMarkItemsRead(), { wrapper });
    await act(() => result.current.mutateAsync([99]));

    expect(qc.getQueryData<ReturnType<typeof itemsPage>>(holder)?.pages[0].data[0].unread).toBe(false);
  });
});
