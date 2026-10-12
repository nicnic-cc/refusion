// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useItems, useMarkScopeRead } from "./items";

const gate: { release: () => void; wait: Promise<void> | null } = {
  release: () => {},
  wait: null,
};
const rows = (ids: number[]) =>
  ids.map((id) => ({ id, feed_id: 1, unread: true, filtered: false }));

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: {
    markScopeRead: vi.fn(async () => {}),
    list: vi.fn(async (params: { before?: string }) => {
      if (!params.before) {
        return { data: rows([45, 44, 43, 42, 41, 40]), next_cursor: "p2", snapshot_id: 50 };
      }
      await gate.wait;
      return { data: rows([35, 34, 33, 32, 31, 30]), next_cursor: null, snapshot_id: 50 };
    }),
  },
}));

describe("useMarkScopeRead during a next-page load", () => {
  // The server marked every item <= max_id, so the arriving page's rows are read too.
  it("marks the rows of a page that lands after the mark as read", async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    gate.wait = new Promise<void>((resolve) => (gate.release = resolve));
    const { result } = renderHook(
      () => {
        const items = useItems({});
        const { isFetchingNextPage } = items;
        return { items, isFetchingNextPage, mark: useMarkScopeRead() };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.items.data?.pages).toHaveLength(1));
    act(() => void result.current.items.fetchNextPage());
    await waitFor(() => expect(result.current.isFetchingNextPage).toBe(true));

    await act(() =>
      result.current.mark.mutateAsync({
        request: { max_id: 50 },
        loadedIds: [40, 41, 42, 43, 44, 45],
      }),
    );
    gate.release();
    await waitFor(() => expect(result.current.items.data?.pages).toHaveLength(2));

    const [first, second] = result.current.items.data!.pages;
    // Control: the rows loaded before the mark are read.
    expect(first.data.every((i) => !i.unread)).toBe(true);
    expect(second.data.every((i) => !i.unread)).toBe(true);
  });
});
