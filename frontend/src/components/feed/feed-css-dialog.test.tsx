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

let submit: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // jsdom does not implement form submission.
  submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
  vi.mocked(itemAPI.list).mockResolvedValue({
    data: [{ id: 42, title: "Newest post" }],
  } as Awaited<ReturnType<typeof itemAPI.list>>);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  submit.mockRestore();
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

  // The preview must POST the unsaved draft to the iframe once typing stops.
  it("posts the draft for the newest item into the preview iframe", async () => {
    setup(stored);
    const frame = await screen.findByTitle("Newest post");
    const form = frame.parentElement!.querySelector("form")!;
    const draftField = () => form.elements.namedItem("css") as HTMLInputElement;
    expect(form.method).toBe("post");
    expect(form.getAttribute("action")).toMatch(/\/items\/42\/page$/);
    expect(form.target).toBe(frame.getAttribute("name"));
    expect(frame.getAttribute("src")).toBeNull();
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(draftField().value).toBe(".ad{display:none}");

    fireEvent.change(screen.getByRole("textbox", { name: "CSS" }), {
      target: { value: "a { color: red }" },
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(draftField().value).toBe("a { color: red }");
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
