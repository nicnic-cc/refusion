// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { itemAPI, type Item } from "@/lib/api";
import { queryKeys } from "./keys";
import { useMarkItemsRead } from "./items";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: { markRead: vi.fn() },
}));

describe("useMarkItemsRead failure", () => {
  // A failed mark must not leave an optimistically created detail entry marked read.
  it("does not leave a read detail entry for an item that had none", async () => {
    vi.mocked(itemAPI.markRead).mockRejectedValue(new Error("offline"));
    const qc = new QueryClient();
    const list = [...queryKeys.items.lists(), {}, 50];
    const item = { id: 8, feed_id: 1, unread: true, filtered: false } as Item;
    qc.setQueryData(list, {
      pages: [{ data: [item], total: 1, next_cursor: null }],
      pageParams: [null],
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMarkItemsRead(), { wrapper });
    await act(() => result.current.mutateAsync([8]).catch(() => {}));

    // Control: the list row is rolled back to unread.
    expect(
      qc.getQueryData<{ pages: { data: Item[] }[] }>(list)?.pages[0].data[0].unread,
    ).toBe(true);
    const detail = qc.getQueryData<Item>(queryKeys.items.detail(8));
    expect(detail === undefined || detail.unread === true).toBe(true);
  });
});
