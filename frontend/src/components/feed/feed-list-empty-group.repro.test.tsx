// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { Feed } from "@/lib/api";
import { FeedList } from "./feed-list";

const urlState = vi.hoisted(() => ({
  selectedFeedId: null as number | null,
  selectedGroupId: null as number | null,
  articleFilter: "all",
  selectAllFeeds: () => {},
}));
vi.mock("@/hooks/use-url-state", () => ({
  useUrlState: () => urlState,
  useUrlActions: () => ({
    selectAllFeeds: () => {},
    setSelectedGroup: () => {},
    setSelectedFeed: () => {},
  }),
  useIsFeedSelected: () => false,
  useIsGroupSelected: () => false,
}));
vi.mock("@/hooks/use-prefetch-list", () => ({ usePrefetchList: () => () => {} }));
vi.mock("@/queries/bookmarks", () => ({
  useBookmarkLookup: () => ({ total: 0, bookmarks: [] }),
}));
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  useLocation: () => "/all",
}));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  groupAPI: {
    list: vi.fn(async () => ({
      data: [
        { id: 1, name: "Default" },
        { id: 5, name: "Empty folder" },
        { id: 6, name: "Tech" },
      ],
    })),
  },
  feedAPI: {
    list: vi.fn(async () => ({
      data: [
        {
          id: 10,
          group_id: 6,
          name: "Example Gadgets",
          unread_count: 0,
          fetch_state: {},
        } as Feed,
      ],
    })),
  },
}));

beforeAll(() => {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

function renderList() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FeedList />
    </QueryClientProvider>,
  );
}

describe("FeedList with an empty user group", () => {
  // Under the "all" filter a group with no feeds must still be listed.
  it("shows an empty group under filter all", async () => {
    renderList();
    await screen.findByText("Tech");
    expect(screen.queryByText("Empty folder")).not.toBeNull();
  });

  // Control: a group that has a feed is shown.
  it("shows a group that has a feed", async () => {
    renderList();
    expect(await screen.findByText("Tech")).not.toBeNull();
  });
});
