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
const rows = (ids: number[], feedId: number) =>
  ids.map((id) => ({ id, feed_id: feedId, unread: true, filtered: false }));

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: {
    markScopeRead: vi.fn(async () => {}),
    list: vi.fn(async (params: { before?: string }) => {
      if (!params.before) {
        return { data: rows([45, 44, 43], 1), next_cursor: "p2", snapshot_id: 50 };
      }
      await gate.wait;
      return {
        data: [...rows([35, 34, 33], 2), ...rows([32], 1)],
        next_cursor: null,
        snapshot_id: 50,
      };
    }),
  },
}));

async function markFeed1WhileNextPageLoads() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  gate.wait = new Promise<void>((resolve) => (gate.release = resolve));
  const { result } = renderHook(
    () => {
      const items = useItems({});
      return { items, isFetchingNextPage: items.isFetchingNextPage, mark: useMarkScopeRead() };
    },
    { wrapper },
  );
  await waitFor(() => expect(result.current.items.data?.pages).toHaveLength(1));
  act(() => void result.current.items.fetchNextPage());
  await waitFor(() => expect(result.current.isFetchingNextPage).toBe(true));
  await act(() =>
    result.current.mark.mutateAsync({
      request: { max_id: Number.MAX_SAFE_INTEGER, feed_id: 1 },
      loadedIds: [],
    }),
  );
  gate.release();
  await waitFor(() => expect(result.current.items.data?.pages).toHaveLength(2));
  return result.current.items.data!.pages[1].data;
}

describe("feed-scoped mark during a next-page load", () => {
  // Marking feed 1 read must not touch feed 2's rows arriving in an in-flight page.
  it("leaves rows of another feed unread", async () => {
    const page = await markFeed1WhileNextPageLoads();
    const other = page.filter((i) => i.feed_id === 2);
    expect(other).toHaveLength(3);
    expect(other.every((i) => i.unread)).toBe(true);
  });

  // Control: the feed-1 row on the same page becomes read.
  it("control: a row of the marked feed on the page becomes read", async () => {
    const page = await markFeed1WhileNextPageLoads();
    expect(page.find((i) => i.feed_id === 1)!.unread).toBe(false);
  });
});
