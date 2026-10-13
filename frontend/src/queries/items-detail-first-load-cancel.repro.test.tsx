// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { itemAPI, type Item } from "@/lib/api";
import { queryKeys } from "./keys";
import { useItem, useMarkItemsRead } from "./items";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: { get: vi.fn(), markRead: vi.fn() },
}));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("marking read during a detail's first load", () => {
  // A detail without data must not be cancelled: it would stay pending and idle, never refetched.
  it("the detail still gets its data", async () => {
    const item = { id: 3, feed_id: 1, unread: true, filtered: false } as Item;
    let resolveFirst: (v: unknown) => void = () => {};
    vi.mocked(itemAPI.get)
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }) as never)
      .mockResolvedValue({ data: item } as never);
    vi.mocked(itemAPI.markRead).mockResolvedValue(undefined as never);

    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({ detail: useItem(3), mark: useMarkItemsRead() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.detail.fetchStatus).toBe("fetching"));

    await act(() => result.current.mark.mutateAsync([3]));
    resolveFirst({ data: item });

    await new Promise((r) => setTimeout(r, 50));
    expect({
      status: result.current.detail.status,
      fetchStatus: result.current.detail.fetchStatus,
    }).not.toEqual({ status: "pending", fetchStatus: "idle" });
    expect(result.current.detail.status).toBe("success");
  });

  // Control: a detail that already has data is still updated optimistically.
  it("control: a loaded detail is marked read", async () => {
    const item = { id: 3, feed_id: 1, unread: true, filtered: false } as Item;
    vi.mocked(itemAPI.markRead).mockResolvedValue(undefined as never);
    const { qc, wrapper } = setup();
    qc.setQueryData(queryKeys.items.detail(3), item);
    const { result } = renderHook(() => useMarkItemsRead(), { wrapper });
    await act(() => result.current.mutateAsync([3]));
    expect(qc.getQueryData<Item>(queryKeys.items.detail(3))?.unread).toBe(false);
  });
});
