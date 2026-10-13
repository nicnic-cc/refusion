// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { bookmarkAPI, type Bookmark } from "@/lib/api";
import { useStarredItems } from "./bookmarks";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  bookmarkAPI: { list: vi.fn() },
}));

const mk = (id: number, permalink: string | null) =>
  ({
    id,
    item_id: id,
    feed_id: 1,
    link: `https://example.com/${id}`,
    permalink,
    title: "t",
    content: "c",
    pub_date: 1,
    unread: false,
    created_at: 1,
  }) as Bookmark;

describe("useStarredItems", () => {
  // The row's open icon must prefer the permalink, like the drawer does.
  it("carries each bookmark's permalink onto its item", async () => {
    vi.mocked(bookmarkAPI.list).mockResolvedValue({
      data: [mk(1, "https://example.com/1/page"), mk(2, null)],
      total: 2,
      next_cursor: null,
    });
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useStarredItems({}), { wrapper });

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.items.map((i) => i.permalink)).toEqual([
      "https://example.com/1/page",
      null,
    ]);
  });
});
