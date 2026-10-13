// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { itemAPI, type Item } from "@/lib/api";
import { queryKeys } from "./keys";
import { useMarkScopeRead } from "./items";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: { markRead: vi.fn(), markUnread: vi.fn(), markScopeRead: vi.fn() },
}));

type Lists = { pages: { data: Item[] }[] };

const BELOW = 5;
const ABOVE = 20;
const MAX_ID = 10;

function setup() {
  const qc = new QueryClient();
  const list = [...queryKeys.items.lists(), {}, 50];
  const rows = [BELOW, ABOVE].map(
    (id) => ({ id, feed_id: 1, unread: true, filtered: false }) as Item,
  );
  qc.setQueryData(list, { pages: [{ data: rows, total: 2, next_cursor: null }], pageParams: [null] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const unreadOf = (id: number) =>
    qc.getQueryData<Lists>(list)!.pages[0].data.find((r) => r.id === id)!.unread;
  return { wrapper, unreadOf };
}

async function runScopeMark(wrapper: ReturnType<typeof setup>["wrapper"]) {
  const { result } = renderHook(() => useMarkScopeRead(), { wrapper });
  await act(async () => {
    await result.current
      .mutateAsync({
        request: { max_id: MAX_ID, feed_id: 1 } as never,
        loadedIds: [BELOW, ABOVE],
      })
      .catch(() => {});
  });
}

describe("scope mark whose follow-up by-id mark fails", () => {
  // The scope PATCH succeeded, so the server has the row at or below max_id read: it stays read.
  it("keeps a loaded row with id <= max_id read", async () => {
    vi.mocked(itemAPI.markScopeRead).mockResolvedValue(undefined as never);
    vi.mocked(itemAPI.markRead).mockRejectedValueOnce(new Error("offline"));
    const { wrapper, unreadOf } = setup();
    await runScopeMark(wrapper);
    expect(unreadOf(BELOW)).toBe(false);
  });

  // Control: the row above max_id was never read on the server, so it reverts.
  it("control: the row above max_id reverts to unread", async () => {
    vi.mocked(itemAPI.markScopeRead).mockResolvedValue(undefined as never);
    vi.mocked(itemAPI.markRead).mockRejectedValueOnce(new Error("offline"));
    const { wrapper, unreadOf } = setup();
    await runScopeMark(wrapper);
    expect(unreadOf(ABOVE)).toBe(true);
  });
});
