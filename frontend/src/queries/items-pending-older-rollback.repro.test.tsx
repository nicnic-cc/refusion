// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { itemAPI, type Item } from "@/lib/api";
import { queryKeys } from "./keys";
import { useMarkItemsRead, useMarkItemsUnread } from "./items";

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

describe("a newer failed mark while an older mark on the same row is pending", () => {
  // The older mark-read succeeds, so the server has the row read: it must end read.
  it("read A pending, unread B fails, A succeeds: row is read", async () => {
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
    await act(async () => { b.reject(new Error("offline")); await pB; });
    await act(async () => { a.resolve(); await pA; });

    expect(unreadOf()).toBe(false);
  });

  // Same, with two mark-reads: the failed B must not undo the successful A.
  it("read A pending, read B fails, A succeeds: row is read", async () => {
    const a = deferred();
    const b = deferred();
    vi.mocked(itemAPI.markRead)
      .mockReturnValueOnce(a.promise as never)
      .mockReturnValueOnce(b.promise as never);
    const { wrapper, unreadOf } = setup();
    const { result } = renderHook(() => useMarkItemsRead(), { wrapper });

    let pA!: Promise<unknown>;
    let pB!: Promise<unknown>;
    await act(async () => { pA = result.current.mutateAsync([1]).catch(() => {}); });
    await act(async () => { pB = result.current.mutateAsync([1]).catch(() => {}); });
    await act(async () => { b.reject(new Error("offline")); await pB; });
    await act(async () => { a.resolve(); await pA; });

    expect(unreadOf()).toBe(false);
  });

  // Control: a lone failed mark-read puts the row back to its original value.
  it("control: a lone failed mark-read reverts the row", async () => {
    vi.mocked(itemAPI.markRead).mockRejectedValueOnce(new Error("offline"));
    const { wrapper, unreadOf } = setup();
    const { result } = renderHook(() => useMarkItemsRead(), { wrapper });
    await act(async () => { await result.current.mutateAsync([1]).catch(() => {}); });
    expect(unreadOf()).toBe(true);
  });
});
