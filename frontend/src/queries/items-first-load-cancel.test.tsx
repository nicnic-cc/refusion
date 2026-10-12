// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { itemAPI } from "@/lib/api";
import { useItems, useMarkItemsRead } from "@/queries/items";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: { list: vi.fn(), markRead: vi.fn() },
}));

describe("marking read during a list's first load", () => {
  // Cancelling a list that has no data yet leaves it pending and idle, which
  // renders "No articles"; there is nothing to overwrite, so it must not be cancelled.
  it("the list still gets its first page", async () => {
    const page = { data: [{ id: 3, feed_id: 1, unread: true, filtered: false }], total: 1, next_cursor: null };
    let resolveFirst: (v: unknown) => void = () => {};
    vi.mocked(itemAPI.list)
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }) as never)
      .mockResolvedValue(page as never);
    vi.mocked(itemAPI.markRead).mockResolvedValue(undefined as never);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => ({ list: useItems({ feedId: 1 }), mark: useMarkItemsRead() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.fetchStatus).toBe("fetching"));

    await act(() => result.current.mark.mutateAsync([3]));
    resolveFirst(page); // the cancelled request's answer is dropped

    await new Promise((r) => setTimeout(r, 50));
    expect({
      status: result.current.list.status,
      fetchStatus: result.current.list.fetchStatus,
    }).not.toEqual({ status: "pending", fetchStatus: "idle" });
  });
});
