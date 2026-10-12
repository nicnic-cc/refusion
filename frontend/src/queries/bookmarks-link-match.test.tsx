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

const LINK = "https://example.org/harbour-report";

describe("useBookmarkLookup link match", () => {
  // bookmarks.link is UNIQUE: the same article in a second feed has another
  // item id but must resolve to the existing bookmark.
  it("finds a bookmark by link when the item id differs", async () => {
    vi.mocked(bookmarkAPI.list).mockResolvedValue({
      data: [{ id: 7, item_id: 100, link: LINK } as Bookmark],
      total: 1,
      next_cursor: null,
    });
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useBookmarkLookup(), { wrapper });
    await waitFor(() => expect(result.current.bookmarks).toHaveLength(1));

    const { isItemStarred, getBookmarkByItemId } = result.current;
    expect(isItemStarred(200, LINK)).toBe(true);
    expect(getBookmarkByItemId(200, LINK)?.id).toBe(7);
    expect(isItemStarred(100, LINK)).toBe(true);
    expect(isItemStarred(200, "https://example.org/other")).toBe(false);
    expect(getBookmarkByItemId(200, "https://example.org/other")).toBeUndefined();
  });
});
