// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/lib/api", () => ({
  settingsAPI: { get: () => get(), update: vi.fn() },
}));

import {
  prefetchRemoteSettings,
  pullRemoteSettings,
  resetSettingsPull,
} from "./settings-sync";

beforeEach(() => {
  get.mockReset();
  resetSettingsPull();
});

describe("settings sync startup", () => {
  it("reuses the prefetched GET instead of fetching twice", async () => {
    get.mockResolvedValue({ data: undefined });
    void prefetchRemoteSettings();
    await pullRemoteSettings();
    expect(get).toHaveBeenCalledTimes(1);
  });

  // A logged-out prefetch holds a 401; after login the pull must fetch anew.
  it("fetches again after a reset following a failed prefetch", async () => {
    get.mockRejectedValueOnce(new Error("401"));
    await prefetchRemoteSettings();
    resetSettingsPull();
    get.mockResolvedValue({ data: undefined });
    await pullRemoteSettings();
    expect(get).toHaveBeenCalledTimes(2);
  });
});
