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
  itemAPI: { markRead: vi.fn() },
}));

describe("overlapping mark-read requests", () => {
  // Mark [1] fails after mark [2] succeeded: only item 1 reverts; item 2 stays read.
  it("a late failure does not revert another mark's row", async () => {
    let resolveB: () => void = () => {};
    let rejectA: (e: Error) => void = () => {};
    vi.mocked(itemAPI.markRead)
      .mockImplementationOnce(() => new Promise((_, rej) => { rejectA = rej; }) as never)
      .mockImplementationOnce(() => new Promise((res) => { resolveB = () => res(undefined); }) as never);

    const qc = new QueryClient();
    const list = [...queryKeys.items.lists(), {}, 50];
    const rows = [1, 2].map((id) => ({ id, feed_id: 1, unread: true, filtered: false }) as Item);
    qc.setQueryData(list, { pages: [{ data: rows, total: 2, next_cursor: null }], pageParams: [null] });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMarkItemsRead(), { wrapper });

    let pA!: Promise<unknown>;
    let pB!: Promise<unknown>;
    await act(async () => { pA = result.current.mutateAsync([1]).catch(() => {}); });
    await act(async () => { pB = result.current.mutateAsync([2]).catch(() => {}); });
    await act(async () => { resolveB(); await pB; });
    await act(async () => { rejectA(new Error("offline")); await pA; });

    const data = qc.getQueryData<{ pages: { data: Item[] }[] }>(list)!.pages[0].data;
    expect(data.find((i) => i.id === 1)?.unread).toBe(true);
    expect(data.find((i) => i.id === 2)?.unread).toBe(false);
  });
});
