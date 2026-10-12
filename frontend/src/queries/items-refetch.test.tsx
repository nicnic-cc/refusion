// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { itemAPI } from "@/lib/api";
import { queryKeys } from "./keys";
import { useItems } from "./items";

// A cursor "n" names page n; the last page (4) has no next cursor.
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: {
    list: vi.fn(async (params: { before?: string }) => {
      const n = Number(params.before ?? 0);
      return {
        data: [{ id: 100 - n }],
        next_cursor: n < 4 ? String(n + 1) : null,
        snapshot_id: 1,
      };
    }),
  },
}));

describe("useItems", () => {
  // A stale long list reloads one page, not every loaded page in turn.
  it("refetches only the first page when 5 pages are loaded", async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useItems({}), { wrapper });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    for (let i = 2; i <= 5; i++) {
      act(() => void result.current.fetchNextPage());
      await waitFor(() => expect(result.current.data?.pages).toHaveLength(i));
    }

    const list = vi.mocked(itemAPI.list);
    list.mockClear();
    await act(() => qc.invalidateQueries({ queryKey: queryKeys.items.lists() }));

    expect(list).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));

    // Loading further still works after the reset.
    expect(result.current.hasNextPage).toBe(true);
    act(() => void result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
  });
});
