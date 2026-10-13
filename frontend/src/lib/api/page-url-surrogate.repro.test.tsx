// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { itemAPI, type Feed, type FeedWebCSS } from "@/lib/api";
import { FeedCssDialog } from "@/components/feed/feed-css-dialog";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  itemAPI: {
    ...(await orig<typeof import("@/lib/api")>()).itemAPI,
    list: vi.fn(),
  },
}));

const feed = { id: 5, name: "Lighthouse Weekly" } as Feed;

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  // jsdom does not implement form submission.
  vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
  vi.mocked(itemAPI.list).mockResolvedValue({
    data: [{ id: 42, title: "Newest post" }],
  } as Awaited<ReturnType<typeof itemAPI.list>>);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function previewField(css: string) {
  const stored: FeedWebCSS = { feed_id: 5, css, updated_at: 1 };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FeedCssDialog feed={feed} css={stored} open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
  const frame = await screen.findByTitle("Newest post");
  const form = frame.parentElement!.querySelector("form")!;
  return form.elements.namedItem("css") as HTMLInputElement;
}

// The old preview put the draft in a ?css= URL via encodeURIComponent, which
// throws a URIError on a lone surrogate (half-typed emoji) while rendering.
describe("CSS preview request", () => {
  it("does not throw on a lone surrogate in the draft", async () => {
    expect((await previewField("a\ud83d")).value).toBe("a\ud83d");
  });

  it("control: a normal draft is the css form field", async () => {
    expect((await previewField("a{color:red}")).value).toBe("a{color:red}");
  });
});
