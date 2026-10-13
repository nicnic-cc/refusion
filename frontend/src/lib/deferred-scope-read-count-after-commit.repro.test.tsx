// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { itemAPI, type Feed } from "@/lib/api";
import { queryKeys } from "@/queries/keys";
import {
  UNDO_WINDOW_MS,
  isFeedCovered,
  pendingScope,
  usePendingFeedReadsStore,
} from "@/store/pending-feed-reads";
import { useDeferredScopeRead } from "./deferred-scope-read";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { dismiss: vi.fn(), error: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ state: { matches: [] } }),
}));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: { markRead: vi.fn(), markUnread: vi.fn(), markScopeRead: vi.fn() },
}));

const scope = pendingScope.feed(1);

// What the sidebar row shows: a covered feed counts 0, otherwise the cached count.
function setup() {
  const qc = new QueryClient();
  qc.setQueryData(queryKeys.feeds.list(), [
    { id: 1, group_id: 7, name: "Example Feed", unread_count: 150 } as Feed,
  ]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useDeferredScopeRead(), { wrapper });
  act(() => {
    result.current({
      scope,
      name: "Example Feed",
      count: 150,
      mark: { request: { max_id: 10, feed_id: 1 }, loadedIds: () => [] },
    });
  });
  return () => {
    const [feed] = qc.getQueryData<Feed[]>(queryKeys.feeds.list())!;
    const pending = usePendingFeedReadsStore.getState().pending;
    return isFeedCovered(pending, feed) ? 0 : feed.unread_count;
  };
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

describe("feed count around the deferred commit", () => {
  // While the scope PATCH is still in flight after the commit, the feed must keep showing 0, not jump back to 150.
  it("shows 0 after the window ends while the PATCH is unresolved", async () => {
    const displayed = setup();
    await act(async () => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS + 1);
    });
    expect(itemAPI.markScopeRead).toHaveBeenCalledTimes(1);
    expect(displayed()).toBe(0);
  });

  // Control: inside the undo window the covered feed shows 0.
  it("control: shows 0 inside the undo window", () => {
    const displayed = setup();
    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    });
    expect(displayed()).toBe(0);
  });
});
