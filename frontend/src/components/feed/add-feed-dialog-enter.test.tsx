// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
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

const feedUrl = "https://example.com/feed.xml";

async function openDialog() {
  vi.mocked(feedAPI.validate).mockResolvedValue({
    data: { feeds: [{ title: "Example", link: feedUrl }] },
  } as never);
  vi.mocked(feedAPI.create).mockResolvedValue({ data: { id: 9 } } as never);
  useUIStore.setState({ isAddFeedOpen: true });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddFeedDialog />
    </QueryClientProvider>,
  );
  return screen.findByLabelText("Feed URL");
}

describe("AddFeedDialog Enter key", () => {
  // The phone keyboard's Go key hides the Add button behind it, so Enter must submit.
  it("creates the feed once when Enter is pressed in the URL field", async () => {
    const input = await openDialog();
    await userEvent.type(input, `${feedUrl}{Enter}`);
    await vi.waitFor(() => expect(feedAPI.create).toHaveBeenCalledTimes(1));
  });

  it("does nothing when Enter is pressed with an empty URL", async () => {
    const input = await openDialog();
    await userEvent.type(input, "   {Enter}");
    expect(feedAPI.create).not.toHaveBeenCalled();
  });
});
