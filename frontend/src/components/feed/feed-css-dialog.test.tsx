// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { feedWebCSSAPI, itemAPI, type Feed, type FeedWebCSS } from "@/lib/api";
import { FeedCssDialog } from "./feed-css-dialog";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  feedWebCSSAPI: {
    list: vi.fn(async () => ({ data: [] })),
    save: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  },
  itemAPI: {
    ...(await orig<typeof import("@/lib/api")>()).itemAPI,
    list: vi.fn(),
  },
}));

const feed = { id: 5, name: "Lighthouse Weekly" } as Feed;
const stored: FeedWebCSS = { feed_id: 5, css: ".ad{display:none}", updated_at: 1 };

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  vi.mocked(itemAPI.list).mockResolvedValue({
    data: [{ id: 42, title: "Newest post" }],
  } as Awaited<ReturnType<typeof itemAPI.list>>);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup(css?: FeedWebCSS) {
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FeedCssDialog feed={feed} css={css} open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return onOpenChange;
}

describe("FeedCssDialog", () => {
  it("saves the draft with PUT and closes", async () => {
    const onOpenChange = setup();
    const save = screen.getByRole("button", { name: "Save" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "CSS" }), {
      target: { value: "body { margin: 0 }" },
    });
    await userEvent.click(save);
    await waitFor(() =>
      expect(feedWebCSSAPI.save).toHaveBeenCalledWith(5, "body { margin: 0 }"),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("deletes the stored CSS after the confirm", async () => {
    setup(stored);
    await userEvent.click(screen.getByRole("button", { name: "Delete CSS" }));
    // The confirm dialog repeats the label; its button is the last one.
    const buttons = await screen.findAllByRole("button", { name: "Delete CSS" });
    await userEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(feedWebCSSAPI.delete).toHaveBeenCalledWith(5));
  });

  // The preview must show the unsaved draft, URL-encoded, once typing stops.
  it("points the preview at the newest item with the encoded draft", async () => {
    setup(stored);
    const frame = await screen.findByTitle("Newest post");
    expect(frame.getAttribute("src")).toContain("/items/42/page?css=.ad");
    fireEvent.change(screen.getByRole("textbox", { name: "CSS" }), {
      target: { value: "a { color: red }" },
    });
    await waitFor(
      () =>
        expect(screen.getByTitle("Newest post").getAttribute("src")).toContain(
          `?css=${encodeURIComponent("a { color: red }")}`,
        ),
      { timeout: 2000 },
    );
    expect(itemAPI.list).toHaveBeenCalledWith(
      expect.objectContaining({ feed_id: 5, limit: 1, include_filtered: true }),
    );
  });

  it("says so when the feed has no article", async () => {
    vi.mocked(itemAPI.list).mockResolvedValue({
      data: [],
    } as unknown as Awaited<ReturnType<typeof itemAPI.list>>);
    setup();
    expect(await screen.findByText("No article to preview yet")).toBeTruthy();
  });

  it("blocks saving a draft over 32 KiB", async () => {
    setup();
    fireEvent.change(screen.getByRole("textbox", { name: "CSS" }), {
      target: { value: "a".repeat((32 << 10) + 1) },
    });
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/larger than 32 KiB/)).toBeTruthy();
  });
});
