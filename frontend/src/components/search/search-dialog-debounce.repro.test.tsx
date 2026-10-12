// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { searchAPI } from "@/lib/api";
import type { SearchItem } from "@/lib/api/types";
import { useUIStore } from "@/store";
import { SearchDialog } from "./search-dialog";

const { setSelectedArticle } = vi.hoisted(() => ({ setSelectedArticle: vi.fn() }));

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  searchAPI: { search: vi.fn() },
  feedAPI: { list: vi.fn(async () => ({ data: [] })) },
}));
vi.mock("@/hooks/use-url-state", () => ({
  useUrlState: () => ({ setSelectedFeed: vi.fn(), setSelectedArticle }),
}));

function item(id: number, title: string): SearchItem {
  return {
    id,
    feed_id: 1,
    title,
    title_parts: [{ text: title, hit: false }],
    excerpt_parts: [],
    pub_date: 1_700_000_000,
  };
}

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  vi.mocked(searchAPI.search).mockImplementation(async (q: string) => ({
    data: {
      feeds: [],
      items: [q === "a" ? item(11, "Aphids in spring") : item(22, "Abelia pruning")],
    },
  }));
  useUIStore.setState({ isSearchOpen: true });
});
afterEach(() => {
  cleanup();
  setSelectedArticle.mockClear();
  useUIStore.setState({ isSearchOpen: false });
});

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

async function searchA() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SearchDialog />
    </QueryClientProvider>,
  );
  const input = screen.getByRole("combobox");
  await userEvent.type(input, "a");
  await screen.findByText("Aphids in spring");
  return input;
}

describe("SearchDialog debounce window", () => {
  // Enter right after typing "ab" must not open an article that only answers the old query "a".
  it("does not open an old-query result before the new query's debounce ends", async () => {
    const input = await searchA();
    await userEvent.type(input, "b{Enter}");
    expect(setSelectedArticle).not.toHaveBeenCalledWith(11);
  });

  // Control: once the debounce settles, Enter opens the new query's result.
  it("opens the new query's result after the debounce", async () => {
    const input = await searchA();
    await userEvent.type(input, "b");
    await screen.findByText("Abelia pruning");
    await wait(0);
    await userEvent.type(input, "{Enter}");
    expect(setSelectedArticle).toHaveBeenCalledWith(22);
  });
});
