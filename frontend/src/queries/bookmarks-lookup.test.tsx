// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { bookmarkAPI, type Bookmark } from "@/lib/api";
import { useBookmarkLookup } from "./bookmarks";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  bookmarkAPI: { list: vi.fn() },
}));

const mk = (n: number, itemId: number) => ({ id: n, item_id: itemId }) as Bookmark;

describe("useBookmarkLookup", () => {
  // Star state must cover bookmarks beyond the first page (total 101 > 100 loaded).
  it("marks an item starred when its bookmark is on page 2", async () => {
    vi.mocked(bookmarkAPI.list).mockImplementation(async (params) =>
      params?.before
        ? { data: [mk(101, 999)], total: 101, next_cursor: null }
        : {
            data: Array.from({ length: 100 }, (_, i) => mk(i + 1, i + 1)),
            total: 101,
            next_cursor: "c1",
          },
    );
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useBookmarkLookup(), { wrapper });

    await waitFor(() => expect(result.current.bookmarks.length).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.isItemStarred(999)).toBe(true), {
      timeout: 1500,
    });
  });
});
