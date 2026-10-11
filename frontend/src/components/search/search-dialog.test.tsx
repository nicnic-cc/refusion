// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { searchAPI } from "@/lib/api";
import { useUIStore } from "@/store";
import { SearchDialog } from "./search-dialog";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  searchAPI: { search: vi.fn() },
  feedAPI: { list: vi.fn(async () => ({ data: [] })) },
}));
vi.mock("@/hooks/use-url-state", () => ({
  useUrlState: () => ({ setSelectedFeed: vi.fn(), setSelectedArticle: vi.fn() }),
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  vi.mocked(searchAPI.search).mockResolvedValue({
    data: {
      feeds: [{ id: 1, name: "Zebra Weekly", link: "https://z.test/feed", site_url: "https://z.test" }],
      items: [],
    },
  });
  useUIStore.setState({ isSearchOpen: true });
});
afterEach(() => {
  cleanup();
  useUIStore.setState({ isSearchOpen: false });
});

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

function setup() {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <SearchDialog />
    </QueryClientProvider>,
  );
  return screen.getByRole("combobox");
}

describe("SearchDialog", () => {
  // Clearing the input removes the previous results from the list.
  it("drops stale results after the input is cleared", async () => {
    const input = setup();
    await userEvent.type(input, "zeb");
    await screen.findByText("Zebra Weekly");
    await userEvent.clear(input);
    await wait(500);
    expect(screen.queryByText("Zebra Weekly")).toBeNull();
  });

  // Returning to an already-searched query within the debounce window leaves no spinner.
  it("shows no spinner after typing past and back to the same query", async () => {
    const input = setup();
    await userEvent.type(input, "ab");
    await screen.findByText("Zebra Weekly");
    await wait(300);
    await userEvent.type(input, "c{Backspace}");
    await wait(500);
    expect(document.querySelector(".animate-spin")).toBeNull();
  });
});
