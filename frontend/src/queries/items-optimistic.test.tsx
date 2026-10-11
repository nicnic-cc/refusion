// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Feed, Item } from "@/lib/api";
import { queryKeys } from "./keys";
import { useMarkItemsRead } from "./items";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: { markRead: vi.fn(() => new Promise(() => {})) },
}));

const item = {
  id: 5,
  feed_id: 1,
  unread: true,
  filtered: false,
} as Item;
const listData = { pages: [{ data: [item], total: 1, next_cursor: null }], pageParams: [null] };

describe("useMarkItemsRead", () => {
  // The feed's unread_count drops by 1 for one item, even if cached in two lists.
  it("decrements a feed's unread_count once when the item sits in two cached lists", async () => {
    const qc = new QueryClient();
    qc.setQueryData([...queryKeys.items.lists(), { unread: true }, 50], listData);
    qc.setQueryData([...queryKeys.items.lists(), { unread: false }, 50], listData);
    qc.setQueryData(queryKeys.feeds.list(), [{ id: 1, unread_count: 5 } as Feed]);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMarkItemsRead(), { wrapper });
    act(() => result.current.mutate([5]));

    await waitFor(() =>
      expect(qc.getQueryData<Feed[]>(queryKeys.feeds.list())?.[0].unread_count).not.toBe(5),
    );
    expect(qc.getQueryData<Feed[]>(queryKeys.feeds.list())?.[0].unread_count).toBe(4);
  });
});
