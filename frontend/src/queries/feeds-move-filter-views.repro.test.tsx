// @vitest-environment jsdom
// Repro: useMoveFeedsToGroup leaves hidden counts and unscoped item lists stale after a partial failure.
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { feedAPI, type Feed } from "@/lib/api";
import { queryKeys } from "./keys";
import { useMoveFeedsToGroup } from "./feeds";
import { hiddenCountsKey } from "./feed-filters";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  feedAPI: { update: vi.fn() },
}));

async function movePartiallyFailing() {
  vi.mocked(feedAPI.update).mockReset();
  vi.mocked(feedAPI.update)
    .mockResolvedValueOnce({} as never)
    .mockRejectedValueOnce(new Error("boom"));

  const unscopedItemsKey = queryKeys.items.list({});
  const qc = new QueryClient();
  qc.setQueryData(queryKeys.feeds.list(), [
    { id: 1, group_id: 1 } as Feed,
    { id: 2, group_id: 1 } as Feed,
  ]);
  qc.setQueryData(hiddenCountsKey, { "1": { total: 3 } });
  qc.setQueryData(unscopedItemsKey, { pages: [], pageParams: [] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useMoveFeedsToGroup(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({ fromGroupId: 1, toGroupId: 2 }).catch(() => {});
  });

  expect(feedAPI.update).toHaveBeenCalledTimes(2);
  return { qc, unscopedItemsKey };
}

describe("useMoveFeedsToGroup after a partial failure", () => {
  it("control: invalidates the feeds list", async () => {
    const { qc } = await movePartiallyFailing();
    expect(qc.getQueryState(queryKeys.feeds.list())?.isInvalidated).toBe(true);
  });

  it("invalidates the hidden counts", async () => {
    const { qc } = await movePartiallyFailing();
    expect(qc.getQueryState(hiddenCountsKey)?.isInvalidated).toBe(true);
  });

  it("invalidates the unscoped item list", async () => {
    const { qc, unscopedItemsKey } = await movePartiallyFailing();
    expect(qc.getQueryState(unscopedItemsKey)?.isInvalidated).toBe(true);
  });
});
