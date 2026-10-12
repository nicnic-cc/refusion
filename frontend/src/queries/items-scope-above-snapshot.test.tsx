// @vitest-environment jsdom
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { itemAPI } from "@/lib/api";
import { useMarkScopeRead } from "./items";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: {
    markRead: vi.fn(async () => {}),
    markScopeRead: vi.fn(async () => {}),
  },
}));

function mark(request: { max_id: number }, loadedIds: number[]) {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useMarkScopeRead(), { wrapper });
  return act(() => result.current.mutateAsync({ request, loadedIds }));
}

describe("useMarkScopeRead with loaded rows above the snapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  // The scope mark skips ids > max_id, so those loaded rows need a per-id mark.
  it("marks loaded ids above max_id by id", async () => {
    await mark({ max_id: 10 }, [5, 12]);
    expect(itemAPI.markScopeRead).toHaveBeenCalledWith({ max_id: 10 });
    expect(itemAPI.markRead).toHaveBeenCalledWith({ ids: [12] });
  });

  it("does not call markRead when every loaded id is within max_id", async () => {
    await mark({ max_id: 10 }, [5, 10]);
    expect(itemAPI.markScopeRead).toHaveBeenCalledWith({ max_id: 10 });
    expect(itemAPI.markRead).not.toHaveBeenCalled();
  });
});
