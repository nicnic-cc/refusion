// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { Feed } from "@/lib/api";
import { queryKeys } from "./keys";
import { useDeleteFeed } from "./feeds";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  feedAPI: { delete: vi.fn().mockResolvedValue({}) },
}));

describe("useDeleteFeed", () => {
  // Starred lists have staleTime Infinity, and deleting a feed nulls its
  // bookmarks' feed_id and item_id, so every list must refetch.
  it("invalidates every starred list, filtered or not", async () => {
    const qc = new QueryClient();
    const data = { pages: [], pageParams: [null] };
    const key = (filters: object) => [...queryKeys.bookmarks.lists(), filters, 50];
    qc.setQueryData(key({ feedId: null, groupId: null }), data);
    qc.setQueryData(key({ feedId: 1, groupId: null }), data);
    qc.setQueryData(key({ feedId: null, groupId: 2 }), data);
    qc.setQueryData(queryKeys.feeds.list(), [{ id: 1, group_id: 2 } as Feed]);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDeleteFeed(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(1);
    });

    const invalidated = (filters: object) =>
      qc.getQueryState(key(filters))?.isInvalidated;
    expect(invalidated({ feedId: 1, groupId: null })).toBe(true);
    expect(invalidated({ feedId: null, groupId: 2 })).toBe(true);
    expect(invalidated({ feedId: null, groupId: null })).toBe(true);
  });
});
