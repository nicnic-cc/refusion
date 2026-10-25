// @vitest-environment jsdom
// Repro: useMoveFeedsToGroup invalidates the feeds list before every feed update has settled.
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { feedAPI, type Feed } from "@/lib/api";
import { queryKeys } from "./keys";
import { useMoveFeedsToGroup } from "./feeds";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  feedAPI: { update: vi.fn() },
}));

function setup(firstUpdate: () => Promise<never>) {
  let resolveSecond: () => void = () => {};
  const second = new Promise<never>((resolve) => {
    resolveSecond = () => resolve({} as never);
  });
  vi.mocked(feedAPI.update).mockReset();
  vi.mocked(feedAPI.update)
    .mockImplementationOnce(firstUpdate)
    .mockImplementationOnce(() => second);

  const qc = new QueryClient();
  qc.setQueryData(queryKeys.feeds.list(), [
    { id: 1, group_id: 1 } as Feed,
    { id: 2, group_id: 1 } as Feed,
  ]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useMoveFeedsToGroup(), { wrapper });
  const invalidated = () => qc.getQueryState(queryKeys.feeds.list())?.isInvalidated;
  return { result, resolveSecond, invalidated };
}

describe("useMoveFeedsToGroup settling", () => {
  it("control: invalidates the feeds list after both updates resolved", async () => {
    const { result, resolveSecond, invalidated } = setup(() => Promise.resolve({} as never));

    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = result.current.mutateAsync({ fromGroupId: 1, toGroupId: 2 });
    });
    await waitFor(() => expect(feedAPI.update).toHaveBeenCalledTimes(2));
    expect(invalidated()).toBe(false);

    await act(async () => {
      resolveSecond();
      await done;
    });
    expect(invalidated()).toBe(true);
  });

  // Correct: the list stays valid and the mutation pending until the second update settles.
  it("does not invalidate the feeds list while an update is still pending after a rejection", async () => {
    const { result, resolveSecond, invalidated } = setup(() => Promise.reject(new Error("boom")));

    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = result.current.mutateAsync({ fromGroupId: 1, toGroupId: 2 }).catch(() => {});
    });
    await waitFor(() => expect(feedAPI.update).toHaveBeenCalledTimes(2));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(invalidated()).toBe(false);
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      resolveSecond();
      await done;
    });
    expect(invalidated()).toBe(true);
  });
});
