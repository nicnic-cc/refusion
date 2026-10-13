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

const twoFeeds = {
  data: {
    feeds: [
      { title: "Other Posts", link: "https://other.example.org/posts.xml" },
      { title: "Other Comments", link: "https://other.example.org/comments.xml" },
    ],
  },
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

async function startAdd() {
  let resolve!: (v: typeof twoFeeds) => void;
  vi.mocked(feedAPI.validate).mockImplementation(
    () => new Promise((r) => (resolve = r as typeof resolve)),
  );
  useUIStore.setState({ isAddFeedOpen: true });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddFeedDialog />
    </QueryClientProvider>,
  );
  await userEvent.type(await screen.findByLabelText("Feed URL"), "https://example.com");
  await userEvent.click(screen.getByRole("button", { name: "Add Feed" }));
  return () => act(async () => resolve(twoFeeds));
}

describe("AddFeedDialog submit", () => {
  // A validate answer arriving after Cancel must not open the picker or create a feed.
  it("ignores a validate result that arrives after Cancel", async () => {
    const finish = await startAdd();
    await userEvent.click(screen.getAllByRole("button", { name: "Cancel" }).at(-1)!);
    await finish();
    expect(screen.queryByText("Select Feed")).toBeNull();
    expect(feedAPI.create).not.toHaveBeenCalled();
  });

  // Control: without cancelling, the non-matching feeds open the picker.
  it("opens the picker when validate finishes normally", async () => {
    const finish = await startAdd();
    await finish();
    expect(await screen.findByText("Select Feed")).not.toBeNull();
  });
});
