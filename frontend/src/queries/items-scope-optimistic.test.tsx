// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Item } from "@/lib/api";
import { queryKeys } from "./keys";
import { useMarkScopeRead } from "./items";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: { markScopeRead: vi.fn(() => new Promise(() => {})) },
}));

const normal = { id: 5, feed_id: 1, unread: true, filtered: false } as Item;
const filtered = { id: 6, feed_id: 1, unread: true, filtered: true } as Item;
const listData = {
  pages: [{ data: [normal, filtered], total: 2, next_cursor: null }],
  pageParams: [null],
};

describe("useMarkScopeRead", () => {
  // The server skips filtered rows, so the optimistic flip must too.
  it("flips a normal row to read and leaves a filtered row unread", async () => {
    const qc = new QueryClient();
    const key = [...queryKeys.items.lists(), { unread: false }, 50];
    qc.setQueryData(key, listData);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMarkScopeRead(), { wrapper });
    act(() =>
      result.current.mutate({ request: { max_id: 10 }, loadedIds: [5, 6] }),
    );

    const rows = () =>
      qc.getQueryData<typeof listData>(key)?.pages[0].data ?? [];
    await waitFor(() => expect(rows()[0].unread).toBe(false));
    expect(rows()[1].unread).toBe(true);
  });
});
