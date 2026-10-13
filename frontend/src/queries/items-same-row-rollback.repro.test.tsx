// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { itemAPI, type Item } from "@/lib/api";
import { queryKeys } from "./keys";
import { useMarkItemsRead, useMarkItemsUnread, useMarkScopeRead } from "./items";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: { markRead: vi.fn(), markUnread: vi.fn(), markScopeRead: vi.fn() },
}));

type Lists = { pages: { data: Item[] }[] };

function setup() {
  const qc = new QueryClient();
  const list = [...queryKeys.items.lists(), {}, 50];
  const row = { id: 1, feed_id: 1, unread: true, filtered: false } as Item;
  qc.setQueryData(list, { pages: [{ data: [row], total: 1, next_cursor: null }], pageParams: [null] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const unreadOf = () => qc.getQueryData<Lists>(list)!.pages[0].data[0].unread;
  return { wrapper, unreadOf };
}

function deferred() {
  let resolve: () => void = () => {};
  let reject: (e: Error) => void = () => {};
  const promise = new Promise<undefined>((res, rej) => {
    resolve = () => res(undefined);
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("rollback of two marks on the same row", () => {
  // Both marks fail, so the server never changed: the row ends unread.
  it("(a) read then unread, both rejected: row ends unread", async () => {
    const a = deferred();
    const b = deferred();
    vi.mocked(itemAPI.markRead).mockReturnValueOnce(a.promise as never);
    vi.mocked(itemAPI.markUnread).mockReturnValueOnce(b.promise as never);
    const { wrapper, unreadOf } = setup();
    const { result } = renderHook(
      () => ({ read: useMarkItemsRead(), unread: useMarkItemsUnread() }),
      { wrapper },
    );

    let pA!: Promise<unknown>;
    let pB!: Promise<unknown>;
    await act(async () => { pA = result.current.read.mutateAsync([1]).catch(() => {}); });
    await act(async () => { pB = result.current.unread.mutateAsync([1]).catch(() => {}); });
    await act(async () => { a.reject(new Error("offline")); await pA; });
    await act(async () => { b.reject(new Error("offline")); await pB; });

    expect(unreadOf()).toBe(true);
  });

  // The scope mark succeeded, so the server has the row read: a late failure of the earlier mark keeps it read.
  it("(b) read fails after a scope mark succeeded: row stays read", async () => {
    const a = deferred();
    vi.mocked(itemAPI.markRead).mockReturnValueOnce(a.promise as never);
    vi.mocked(itemAPI.markScopeRead).mockResolvedValue(undefined as never);
    const { wrapper, unreadOf } = setup();
    const { result } = renderHook(
      () => ({ read: useMarkItemsRead(), scope: useMarkScopeRead() }),
      { wrapper },
    );

    let pA!: Promise<unknown>;
    await act(async () => { pA = result.current.read.mutateAsync([1]).catch(() => {}); });
    await act(async () => {
      await result.current.scope.mutateAsync({
        request: { max_id: 10 } as never,
        loadedIds: [1],
      });
    });
    await act(async () => { a.reject(new Error("offline")); await pA; });

    expect(unreadOf()).toBe(false);
  });

  // Control: a single failed mark rolls its row back.
  it("control: a lone failed mark-read reverts the row", async () => {
    vi.mocked(itemAPI.markRead).mockRejectedValueOnce(new Error("offline"));
    const { wrapper, unreadOf } = setup();
    const { result } = renderHook(() => useMarkItemsRead(), { wrapper });
    await act(async () => { await result.current.mutateAsync([1]).catch(() => {}); });
    expect(unreadOf()).toBe(true);
  });
});
