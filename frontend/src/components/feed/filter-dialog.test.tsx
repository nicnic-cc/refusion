// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Feed } from "@/lib/api";
import { FilterDialog } from "./filter-dialog";

const feed = { id: 5, name: "Lighthouse Weekly" } as Feed;

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(previewResponse: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => previewResponse()),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FilterDialog feed={feed} open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Condition value" }), {
    target: { value: "sponsored" },
  });
}

describe("FilterDialog preview errors", () => {
  // A proxy's non-JSON 502 must show the localized fallback, not "HTTP 502".
  it("shows the localized fallback for a non-JSON 502", async () => {
    setup(
      () =>
        new Response("<html>Bad Gateway</html>", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        }),
    );
    expect(
      await screen.findByText("The filter request failed. Try again."),
    ).toBeTruthy();
    expect(screen.queryByText(/HTTP 502/)).toBeNull();
  });

  // Control: a server message for a 4xx is still shown as sent.
  it("control: shows the server message for a 400", async () => {
    setup(
      () =>
        new Response(JSON.stringify({ error: "invalid regex" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
    );
    expect(await screen.findByText("invalid regex")).toBeTruthy();
  });
});
