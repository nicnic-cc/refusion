// @vitest-environment jsdom
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { itemAPI } from "@/lib/api";
import { UNDO_WINDOW_MS, pendingScope, usePendingFeedReadsStore } from "@/store/pending-feed-reads";
import { useDeferredScopeRead } from "./deferred-scope-read";

vi.mock("sonner", () => {
  const toast = Object.assign(vi.fn(), { dismiss: vi.fn(), error: vi.fn() });
  return { toast };
});
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ state: { matches: [] } }),
}));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: { markRead: vi.fn(), markUnread: vi.fn(), markScopeRead: vi.fn() },
}));

const scope = pendingScope.feed(1);

function start() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useDeferredScopeRead(), { wrapper });
  act(() => {
    result.current({
      scope,
      name: "Example Feed",
      count: 3,
      mark: { request: { max_id: 10, feed_id: 1 }, loadedIds: () => [] },
    });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(itemAPI.markScopeRead).mockReturnValue(new Promise(() => {}) as never);
});

afterEach(() => {
  cleanup();
  usePendingFeedReadsStore.getState().cancel(scope);
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("deferred scope read toast", () => {
  // Once the commit has sent the request, the Undo toast must be dismissed: Undo can no longer do anything.
  it("dismisses the toast when the commit runs", async () => {
    start();
    await act(async () => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS + 1);
    });
    expect(itemAPI.markScopeRead).toHaveBeenCalledTimes(1);
    expect(toast.dismiss).toHaveBeenCalledWith(`read-${scope}`);
  });

  // Control: Undo clicked inside the window sends no request.
  it("control: Undo before the window ends sends no mark request", async () => {
    start();
    const options = vi.mocked(toast).mock.calls[0][1] as { action: ReactElement<{ onClick: () => void }> };
    act(() => options.action.props.onClick());
    await act(async () => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    });
    expect(itemAPI.markScopeRead).not.toHaveBeenCalled();
  });
});
