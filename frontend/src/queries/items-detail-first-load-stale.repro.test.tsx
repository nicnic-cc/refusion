// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { itemAPI, type Item } from "@/lib/api";
import { queryKeys } from "./keys";
import { useItem, useMarkItemsRead } from "./items";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: { get: vi.fn(), markRead: vi.fn() },
}));

describe("marking read during a detail's first load", () => {
  // The earlier GET answers unread:true after the mark succeeded: the settled detail must show read.
  it("the stale first response does not leave the detail unread", async () => {
    const unreadItem = { id: 1, feed_id: 1, unread: true, filtered: false } as Item;
    let resolveFirst: (v: unknown) => void = () => {};
    vi.mocked(itemAPI.get)
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }) as never)
      .mockResolvedValue({ data: { ...unreadItem, unread: false } } as never);
    vi.mocked(itemAPI.markRead).mockResolvedValue(undefined as never);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData([...queryKeys.items.lists(), {}, 50], {
      pages: [{ data: [unreadItem], total: 1, next_cursor: null }],
      pageParams: [null],
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => ({ detail: useItem(1), mark: useMarkItemsRead() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.detail.fetchStatus).toBe("fetching"));

    await act(() => result.current.mark.mutateAsync([1]));
    await act(async () => { resolveFirst({ data: unreadItem }); });
    await new Promise((r) => setTimeout(r, 50));

    expect(qc.getQueryData<Item>(queryKeys.items.detail(1))?.unread).toBe(false);
  });
});
