// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { feedAPI } from "@/lib/api";
import { useUIStore } from "@/store";
import { AddFeedDialog } from "./add-feed-dialog";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  feedAPI: { validate: vi.fn(), create: vi.fn(), list: vi.fn(async () => ({ data: [] })) },
  groupAPI: { list: vi.fn(async () => ({ data: [{ id: 1, name: "News" }] })) },
  appAPI: { getInfo: vi.fn(async () => ({ data: {} })) },
}));

type Validated = { data: { feeds: { title: string; link: string }[] } };
const oneFeed: Validated = {
  data: { feeds: [{ title: "Example", link: "https://example.com/feed.xml" }] },
};

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

afterEach(() => {
  cleanup();
  vi.mocked(feedAPI.validate).mockReset();
  vi.mocked(feedAPI.create).mockReset();
  useUIStore.setState({ isAddFeedOpen: false });
});

async function openWithUrl() {
  useUIStore.setState({ isAddFeedOpen: true });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddFeedDialog />
    </QueryClientProvider>,
  );
  await userEvent.type(await screen.findByLabelText("Feed URL"), "https://example.com");
}

describe("AddFeedDialog Detect while Add is in flight", () => {
  // Once both validate calls have answered, Add must be usable again, not stuck on "Looking for the feed...".
  it("leaves the Add button enabled after both validates resolve", async () => {
    const resolvers: ((v: Validated) => void)[] = [];
    vi.mocked(feedAPI.validate).mockImplementation(
      () => new Promise((r) => resolvers.push(r as (v: Validated) => void)),
    );
    await openWithUrl();
    await userEvent.click(screen.getByRole("button", { name: "Add Feed" }));
    await userEvent.click(screen.getByRole("button", { name: "Validate feed URL" }));
    expect(resolvers).toHaveLength(2);
    await act(async () => resolvers[0](oneFeed));
    await act(async () => resolvers[1](oneFeed));

    const add = screen.getByRole("button", { name: /Add Feed|Looking for the feed/ });
    expect(add.textContent).not.toContain("Looking for the feed");
    expect((add as HTMLButtonElement).disabled).toBe(false);
  });

  // Control: without a Detect click, Add ends with the picker open and no stuck label.
  it("control: Add alone ends with the picker open and no stuck label", async () => {
    vi.mocked(feedAPI.validate).mockResolvedValue({
      data: {
        feeds: [
          { title: "Posts", link: "https://other.example.org/posts.xml" },
          { title: "Comments", link: "https://other.example.org/comments.xml" },
        ],
      },
    } as never);
    await openWithUrl();
    await userEvent.click(screen.getByRole("button", { name: "Add Feed" }));
    expect(await screen.findByText("Select Feed")).not.toBeNull();
    expect(screen.queryByText("Looking for the feed...")).toBeNull();
  });
});
