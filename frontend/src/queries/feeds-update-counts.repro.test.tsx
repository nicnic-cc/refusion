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

describe("useUpdateFeed", () => {
  // The PATCH response carries no counts; renaming must not zero the unread count.
  it("keeps the cached unread_count (or refetches) after a rename", async () => {
    const feed = { id: 1, name: "Gardening Weekly", group_id: 1, unread_count: 5 } as Feed;
    vi.mocked(feedAPI.update).mockResolvedValue({
      data: { ...feed, name: "Gardening Daily", unread_count: 0 },
    } as never);
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.feeds.list(), [feed]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateFeed(), { wrapper });
    await act(() => result.current.mutateAsync({ id: 1, name: "Gardening Daily" }));

    const cached = qc.getQueryData<Feed[]>(queryKeys.feeds.list())?.[0];
    expect(cached?.name).toBe("Gardening Daily");
    const keptCount = cached?.unread_count === 5;
    const refetches = qc.getQueryState(queryKeys.feeds.list())?.isInvalidated === true;
    expect(keptCount || refetches).toBe(true);
  });
});
