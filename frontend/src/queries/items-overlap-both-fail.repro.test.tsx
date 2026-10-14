// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { itemAPI, type Item } from "@/lib/api";
import { queryKeys } from "./keys";
import { useMarkItemsRead } from "./items";

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
  let reject: (e: Error) => void = () => {};
  const promise = new Promise<undefined>((_, rej) => {
    reject = rej;
  });
  return { promise, reject };
}

async function markTwiceThenReject(order: "AB" | "BA") {
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
  expect(unreadOf()).toBe(false);
  await act(async () => { pB = result.current.mutateAsync([1]).catch(() => {}); });
  const first = order === "AB" ? [a, pA] : [b, pB];
  const second = order === "AB" ? [b, pB] : [a, pA];
  await act(async () => { (first[0] as typeof a).reject(new Error("offline")); await first[1]; });
  await act(async () => { (second[0] as typeof a).reject(new Error("offline")); await second[1]; });
  return unreadOf();
}

describe("two overlapping mark-read calls on the same row, both rejected", () => {
  // Neither mark reached the server, so the row must end unread whichever fails first.
  it("rejecting the first mark, then the second, ends unread", async () => {
    expect(await markTwiceThenReject("AB")).toBe(true);
  });

  // Control: rejecting the second mark first, then the first, ends unread.
  it("control: rejecting the second mark, then the first, ends unread", async () => {
    expect(await markTwiceThenReject("BA")).toBe(true);
  });
});
