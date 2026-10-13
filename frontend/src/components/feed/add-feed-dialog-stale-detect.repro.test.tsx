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
  feedAPI: { validate: vi.fn(), list: vi.fn(async () => ({ data: [] })) },
  groupAPI: { list: vi.fn(async () => ({ data: [{ id: 1, name: "News" }] })) },
  appAPI: { getInfo: vi.fn(async () => ({ data: {} })) },
}));

const twoFeeds = {
  data: {
    feeds: [
      { title: "Example Posts", link: "https://example.com/posts.xml" },
      { title: "Example Comments", link: "https://example.com/comments.xml" },
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
  useUIStore.setState({ isAddFeedOpen: false });
});

async function startDetect() {
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
  await userEvent.type(
    await screen.findByLabelText("Feed URL"),
    "https://example.com",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Validate feed URL" }),
  );
  return () => act(async () => resolve(twoFeeds));
}

describe("AddFeedDialog feed detection", () => {
  // Detection finishing after Cancel must not pop the picker or reopen anything.
  it("ignores a detect result that arrives after Cancel", async () => {
    const finish = await startDetect();
    await userEvent.click(screen.getAllByRole("button", { name: "Cancel" }).at(-1)!);
    await finish();
    expect(screen.queryByText("Select Feed")).toBeNull();
    expect(useUIStore.getState().isAddFeedOpen).toBe(false);
  });

  // Control: without cancelling, two detected feeds open the picker.
  it("opens the picker when detection finishes normally", async () => {
    const finish = await startDetect();
    await finish();
    expect(await screen.findByText("Select Feed")).not.toBeNull();
  });
});
