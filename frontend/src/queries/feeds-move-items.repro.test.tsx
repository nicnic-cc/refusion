// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { feedAPI, type Feed } from "@/lib/api";
import { queryKeys } from "./keys";
import { useUpdateFeed } from "./feeds";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  feedAPI: { update: vi.fn() },
}));

describe("useUpdateFeed group move", () => {
  // Moving a feed out of group 1 changes what the group's items list holds.
  it("invalidates a cached items list keyed by the old group", async () => {
    const feed = { id: 1, name: "Gardening Weekly", group_id: 1, unread_count: 5 } as Feed;
    vi.mocked(feedAPI.update).mockResolvedValue({
      data: { ...feed, group_id: 2 },
    } as never);
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.feeds.list(), [feed]);
    const groupList = [...queryKeys.items.list({ groupId: 1 }), 50];
    qc.setQueryData(groupList, {
      pages: [{ data: [], total: 0, next_cursor: null }],
      pageParams: [null],
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateFeed(), { wrapper });
    await act(() => result.current.mutateAsync({ id: 1, group_id: 2 }));

    // Control: the feeds list is already invalidated by a move.
    expect(qc.getQueryState(queryKeys.feeds.list())?.isInvalidated).toBe(true);
    expect(qc.getQueryState(groupList)?.isInvalidated).toBe(true);
  });
});
