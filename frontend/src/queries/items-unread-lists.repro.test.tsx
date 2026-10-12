// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { Item } from "@/lib/api";
import { queryKeys } from "./keys";
import { useMarkItemsUnread } from "./items";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: { markUnread: vi.fn(async () => {}) },
}));

describe("useMarkItemsUnread", () => {
  // Marking item 7 unread must make the cached unread-only list pick it up.
  it("invalidates (or fills) a cached unread list that lacks the item", async () => {
    const qc = new QueryClient();
    const unreadList = [...queryKeys.items.list({ unread: true }), 50];
    const other = { id: 1, feed_id: 1, unread: true, filtered: false } as Item;
    qc.setQueryData(unreadList, {
      pages: [{ data: [other], total: 1, next_cursor: null }],
      pageParams: [null],
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMarkItemsUnread(), { wrapper });
    await act(() => result.current.mutateAsync([7]));

    const data = qc.getQueryData<{ pages: { data: Item[] }[] }>(unreadList);
    const holds7 = !!data?.pages.some((p) => p.data.some((i) => i.id === 7));
    const invalidated = qc.getQueryState(unreadList)?.isInvalidated === true;
    expect(holds7 || invalidated).toBe(true);
  });
});
