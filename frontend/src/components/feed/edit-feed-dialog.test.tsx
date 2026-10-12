// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { feedAPI, type Feed } from "@/lib/api";
import { useUIStore } from "@/store";
import { EditFeedDialog } from "./edit-feed-dialog";

const urlState = vi.hoisted(() => ({
  selectedFeedId: null as number | null,
  selectTopLevelFilter: vi.fn(),
}));
vi.mock("@/hooks/use-url-state", () => ({ useUrlState: () => urlState }));

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  feedAPI: {
    list: vi.fn(async () => ({ data: [] })),
    update: vi.fn(),
    delete: vi.fn(async () => ({})),
  },
  groupAPI: { list: vi.fn(async () => ({ data: [{ id: 1, name: "News" }] })) },
  appAPI: { getInfo: vi.fn(async () => ({ data: {} })) },
}));

const feed = {
  id: 5,
  group_id: 1,
  name: "Lighthouse Weekly",
  link: "https://lighthouse.invalid/feed",
  suspended: false,
  proxy: "http://proxy.invalid:3128",
  default_view: "feed",
  open_permalink: false,
  fetch_state: {},
} as Feed;

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  vi.mocked(feedAPI.update).mockResolvedValue({ data: { ...feed, proxy: "" } });
});
afterEach(() => {
  cleanup();
  urlState.selectedFeedId = null;
  urlState.selectTopLevelFilter.mockClear();
  useUIStore.setState({ isEditFeedOpen: false, editingFeed: null });
});

function setup(editing: Feed) {
  useUIStore.setState({ isEditFeedOpen: true, editingFeed: editing });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EditFeedDialog />
    </QueryClientProvider>,
  );
}

describe("EditFeedDialog proxy", () => {
  // An emptied proxy field must reach the backend as "", not be dropped from the PATCH.
  it("sends proxy: \"\" when the field is cleared", async () => {
    setup(feed);
    await userEvent.clear(await screen.findByLabelText("HTTP Proxy"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(feedAPI.update).toHaveBeenCalledWith(5, { proxy: "" });
  });

  // A feed without a proxy and an untouched field sends nothing.
  it("sends no update when a proxy-less feed is saved unchanged", async () => {
    setup({ ...feed, proxy: undefined });
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(feedAPI.update).not.toHaveBeenCalled();
  });
});

describe("EditFeedDialog default view", () => {
  // The advanced section opens on a non-default view so it is not hidden.
  it("sends default_view when another view is chosen", async () => {
    setup({ ...feed, proxy: undefined, default_view: "full" });
    await userEvent.click(await screen.findByRole("combobox", { name: "Open articles as" }));
    await userEvent.click(await screen.findByRole("option", { name: "Web page" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(feedAPI.update).toHaveBeenCalledWith(5, { default_view: "web" });
  });
});

describe("EditFeedDialog links open", () => {
  it("sends open_permalink when the feed's own page is chosen", async () => {
    setup(feed);
    await userEvent.click(await screen.findByRole("combobox", { name: "Links open" }));
    await userEvent.click(await screen.findByRole("option", { name: "Feed's own page" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(feedAPI.update).toHaveBeenCalledWith(5, { open_permalink: true });
  });
});

describe("EditFeedDialog delete", () => {
  async function deleteFeed() {
    setup(feed);
    await userEvent.click(await screen.findByRole("button", { name: "Unsubscribe" }));
    // The confirm dialog repeats the label; its button is the last one.
    const buttons = await screen.findAllByRole("button", { name: "Unsubscribe" });
    await userEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(feedAPI.delete).toHaveBeenCalledWith(5));
  }

  // Deleting the feed shown in the URL must leave its dead URL.
  it("navigates to /unread when the viewed feed is deleted", async () => {
    urlState.selectedFeedId = 5;
    await deleteFeed();
    await waitFor(() =>
      expect(urlState.selectTopLevelFilter).toHaveBeenCalledWith("unread"),
    );
  });

  // Deleting a feed while on another page must not move the user.
  it("stays put when another page is open", async () => {
    urlState.selectedFeedId = 9;
    await deleteFeed();
    expect(urlState.selectTopLevelFilter).not.toHaveBeenCalled();
  });
});
