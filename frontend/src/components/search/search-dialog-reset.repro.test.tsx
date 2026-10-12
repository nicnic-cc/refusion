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
      feeds: [
        { id: 1, name: "Gardening Weekly", link: "https://example.com/feed", site_url: "https://example.com" },
      ],
      items: [],
    },
  });
  useUIStore.setState({ isSearchOpen: true });
});
afterEach(() => {
  cleanup();
  useUIStore.setState({ isSearchOpen: false });
});

async function searchAndPick(close: () => Promise<void>) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SearchDialog />
    </QueryClientProvider>,
  );
  await userEvent.type(screen.getByRole("combobox"), "garden");
  await screen.findByText("Gardening Weekly");
  await close();
  await waitForClosed();
  act(() => useUIStore.setState({ isSearchOpen: true }));
  return (await screen.findByRole("combobox")) as HTMLInputElement;
}

const waitForClosed = () =>
  act(() => new Promise<void>((r) => setTimeout(r, 100)));

describe("SearchDialog reopened after use", () => {
  // Picking a feed result closes the dialog; reopening must show an empty input.
  it("clears the query after a feed result is selected", async () => {
    const input = await searchAndPick(async () => {
      await userEvent.keyboard("{Enter}");
    });
    expect(input.value).toBe("");
  });

  // Control: closing with Escape already resets the query.
  it("clears the query after Escape", async () => {
    const input = await searchAndPick(async () => {
      await userEvent.keyboard("{Escape}");
    });
    expect(input.value).toBe("");
  });
});
