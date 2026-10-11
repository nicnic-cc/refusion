import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePullStore } from "@/store/pull";
import { hiddenCountsKey } from "./feed-filters";
import { applyPullStatus } from "./pull";

// The pull store calls window.clearTimeout; vitest runs in node here.
beforeEach(() => {
  vi.stubGlobal("window", globalThis);
});

afterEach(() => {
  usePullStore.getState().reset();
  vi.unstubAllGlobals();
});

describe("hidden counts", () => {
  it("are invalidated when a pull ends with new items", () => {
    const qc = new QueryClient();
    qc.setQueryData(hiddenCountsKey, { 1: 2 });
    usePullStore.getState().running(1, 0);

    applyPullStatus(qc, { pending: [], new_items: 3, last_item_id: 10 });

    expect(qc.getQueryState(hiddenCountsKey)?.isInvalidated).toBe(true);
  });
});
