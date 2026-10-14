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

const feedUrl = "https://example.com/feed.xml";
const oneFeed = { data: { feeds: [{ title: "Example", link: feedUrl }] } };

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

async function addWithCreatePending() {
  vi.mocked(feedAPI.validate).mockResolvedValue(oneFeed as never);
  let finishCreate: () => void = () => {};
  vi.mocked(feedAPI.create).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishCreate = () => resolve({ data: { id: 9 } } as never);
      }),
  );
  useUIStore.setState({ isAddFeedOpen: true });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddFeedDialog />
    </QueryClientProvider>,
  );
  await userEvent.type(await screen.findByLabelText("Feed URL"), feedUrl);
  await userEvent.click(screen.getByRole("button", { name: "Add Feed" }));
  await vi.waitFor(() => expect(feedAPI.create).toHaveBeenCalled());
  return { finishCreate: () => act(async () => finishCreate()) };
}

describe("AddFeedDialog after the feed is created", () => {
  // The feed exists, so the dialog must close even if Detect was clicked while create was pending.
  it("closes when Detect was clicked during the create", async () => {
    const { finishCreate } = await addWithCreatePending();
    await userEvent.click(screen.getByRole("button", { name: "Validate feed URL" }));
    await finishCreate();
    await vi.waitFor(() => expect(useUIStore.getState().isAddFeedOpen).toBe(false));
  });

  // Control: without a Detect click the dialog closes.
  it("control: closes when no Detect was clicked", async () => {
    const { finishCreate } = await addWithCreatePending();
    await finishCreate();
    await vi.waitFor(() => expect(useUIStore.getState().isAddFeedOpen).toBe(false));
  });
});
