// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { feedAPI, groupAPI, type Feed } from "@/lib/api";
import { queryKeys } from "./keys";
import { useDeleteGroup } from "./groups";
import { useMoveFeedsToGroup } from "./feeds";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  groupAPI: { delete: vi.fn() },
  feedAPI: { update: vi.fn() },
}));

const bookmarkList = [...queryKeys.bookmarks.lists(), { feedId: null, groupId: 1 }, 50];

function setup() {
  const qc = new QueryClient();
  qc.setQueryData(bookmarkList, {
    pages: [{ data: [], total: 0, next_cursor: null }],
    pageParams: [null],
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("group-scoped starred lists", () => {
  // Deleting a group moves its feeds to the default group, so filtered bookmark lists go stale.
  it("useDeleteGroup invalidates filtered bookmark lists", async () => {
    vi.mocked(groupAPI.delete).mockResolvedValue(undefined as never);
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useDeleteGroup(), { wrapper });
    await act(() => result.current.mutateAsync(5));
    expect(qc.getQueryState(bookmarkList)?.isInvalidated).toBe(true);
  });

  // Control: moving feeds between groups already invalidates them.
  it("control: useMoveFeedsToGroup invalidates filtered bookmark lists", async () => {
    vi.mocked(feedAPI.update).mockResolvedValue({ data: {} } as never);
    const { qc, wrapper } = setup();
    qc.setQueryData(queryKeys.feeds.list(), [{ id: 1, group_id: 5 } as Feed]);
    const { result } = renderHook(() => useMoveFeedsToGroup(), { wrapper });
    await act(() => result.current.mutateAsync({ fromGroupId: 5, toGroupId: 1 }));
    expect(qc.getQueryState(bookmarkList)?.isInvalidated).toBe(true);
  });
});
