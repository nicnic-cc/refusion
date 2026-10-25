// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Feed, Group } from "@/lib/api";
import { FilterDialog, type FilterTarget } from "./filter-dialog";

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

function setup(target: FilterTarget) {
  const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
    async () =>
      new Response(
        JSON.stringify({ data: { checked: 0, hidden: 0, items: [] } }),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FilterDialog target={target} open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Condition value" }), {
    target: { value: "sponsored" },
  });
  return fetchMock;
}

// Each kind previews against its own route; only global lacks Remove/Keep.
describe("FilterDialog target kinds", () => {
  it.each([
    [{ kind: "feed", feed: { id: 5, name: "Harbor Notes" } as Feed }, "/feeds/5/filter/preview", true],
    [{ kind: "group", group: { id: 3, name: "Tide Tables" } as Group }, "/groups/3/filter/preview", true],
    [{ kind: "global" }, "/global-filter/preview", false],
  ] as [FilterTarget, string, boolean][])(
    "%o previews at %s",
    async (target, path, hasKeep) => {
      const fetchMock = setup(target);
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(String(fetchMock.mock.calls[0][0])).toContain(path);
      expect(!!screen.queryByRole("tab", { name: "Keep articles" })).toBe(
        hasKeep,
      );
    },
  );
});
