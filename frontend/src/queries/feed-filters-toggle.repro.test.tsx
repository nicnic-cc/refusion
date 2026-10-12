// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { feedFilterAPI } from "@/lib/api";
import { useSetFeedFilterEnabled } from "@/queries/feed-filters";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  feedFilterAPI: { setEnabled: vi.fn() },
}));

function setup() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSetFeedFilterEnabled(), { wrapper });
}

// Mirrors feeds.lazy.tsx: every switch calls mutate on one shared hook with a per-call onError.
describe("useSetFeedFilterEnabled shared by several switches", () => {
  // Toggling B while A is pending must not drop A's own error callback when A fails.
  it("still reports A's failure after B was toggled", async () => {
    let rejectA!: (err: Error) => void;
    vi.mocked(feedFilterAPI.setEnabled)
      .mockImplementationOnce(() => new Promise((_, reject) => (rejectA = reject)))
      .mockImplementationOnce(() => new Promise(() => {}));
    const { result } = setup();
    const onErrorA = vi.fn();
    const onErrorB = vi.fn();

    await act(async () =>
      result.current.mutate({ feedId: 1, enabled: false }, { onError: onErrorA }),
    );
    await act(async () =>
      result.current.mutate({ feedId: 2, enabled: false }, { onError: onErrorB }),
    );
    await act(async () => rejectA(new Error("network down")));

    expect(onErrorA).toHaveBeenCalledTimes(1);
  });

  // Control: a single toggle reports its failure.
  it("reports the failure of a lone toggle", async () => {
    vi.mocked(feedFilterAPI.setEnabled).mockRejectedValueOnce(new Error("network down"));
    const { result } = setup();
    const onError = vi.fn();
    await act(async () => result.current.mutate({ feedId: 1, enabled: false }, { onError }));
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
