// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { hiddenCountsKey } from "@/queries/feed-filters";
import { usePrefetchFilterViews } from "./use-prefetch-filter-views";

vi.mock("@/lib/api", () => ({
  feedFilterAPI: { list: async () => ({ data: [{ feed_id: 1 }] }) },
  hiddenCountsAPI: { get: async () => ({ data: { 1: { hidden: 2 } } }) },
}));

afterEach(cleanup);

describe("usePrefetchFilterViews", () => {
  it("fills the feed filter and hidden counts caches", async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderHook(() => usePrefetchFilterViews(), { wrapper });
    await waitFor(() => {
      expect(qc.getQueryData(["feed-filters"])).toEqual([{ feed_id: 1 }]);
      expect(qc.getQueryData(hiddenCountsKey)).toBeDefined();
    });
  });
});
