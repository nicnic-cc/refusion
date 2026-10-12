// @vitest-environment jsdom
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { itemAPI, type Item } from "@/lib/api";
import { queryKeys } from "./keys";
import { useMarkScopeRead } from "./items";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: {
    markRead: vi.fn(async () => {}),
    markScopeRead: vi.fn(async () => {}),
  },
}));

function mark(
  request: { max_id: number },
  loadedIds: number[],
  rows: Item[] = [],
) {
  const qc = new QueryClient();
  if (rows.length > 0) {
    qc.setQueryData([...queryKeys.items.lists(), { unread: false }, 50], {
      pages: [{ data: rows, total: rows.length, next_cursor: null }],
      pageParams: [null],
    });
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useMarkScopeRead(), { wrapper });
  return act(() => result.current.mutateAsync({ request, loadedIds }));
}

describe("useMarkScopeRead with loaded rows above the snapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  // The scope mark skips ids > max_id, so those loaded rows need a per-id mark.
  it("marks loaded ids above max_id by id", async () => {
    await mark({ max_id: 10 }, [5, 12]);
    expect(itemAPI.markScopeRead).toHaveBeenCalledWith({ max_id: 10 });
    expect(itemAPI.markRead).toHaveBeenCalledWith({ ids: [12] });
  });

  it("does not call markRead when every loaded id is within max_id", async () => {
    await mark({ max_id: 10 }, [5, 10]);
    expect(itemAPI.markScopeRead).toHaveBeenCalledWith({ max_id: 10 });
    expect(itemAPI.markRead).not.toHaveBeenCalled();
  });

  // The scope mark skips filtered rows; a by-id mark would change them.
  it("does not mark a filtered loaded row above max_id by id", async () => {
    const rows = [
      { id: 12, feed_id: 1, unread: true, filtered: false },
      { id: 13, feed_id: 1, unread: true, filtered: true },
    ] as Item[];
    await mark({ max_id: 10 }, [12, 13], rows);
    expect(itemAPI.markRead).toHaveBeenCalledWith({ ids: [12] });
  });
});
