// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { feedAPI, type Feed } from "@/lib/api";
import { queryKeys } from "./keys";
import { useMoveFeedsToGroup } from "./feeds";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  feedAPI: { update: vi.fn() },
}));

describe("useMoveFeedsToGroup", () => {
  // After a partial failure the server state differs from the cache, so refetch.
  it("invalidates the feeds list when one of the updates fails", async () => {
    vi.mocked(feedAPI.update)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error("boom"));

    const qc = new QueryClient();
    qc.setQueryData(queryKeys.feeds.list(), [
      { id: 1, group_id: 1 } as Feed,
      { id: 2, group_id: 1 } as Feed,
    ]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMoveFeedsToGroup(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ fromGroupId: 1, toGroupId: 2 }).catch(() => {});
    });

    expect(feedAPI.update).toHaveBeenCalledTimes(2);
    expect(qc.getQueryState(queryKeys.feeds.list())?.isInvalidated).toBe(true);
  });
});
