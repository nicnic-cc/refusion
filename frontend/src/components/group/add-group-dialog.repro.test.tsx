// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { groupAPI } from "@/lib/api";
import { useUIStore } from "@/store";
import { AddGroupDialog } from "./add-group-dialog";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  groupAPI: { create: vi.fn() },
}));

beforeAll(() => {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  vi.mocked(groupAPI.create).mockReset();
  useUIStore.setState({ isAddGroupOpen: false });
});

async function typeName(keys: string) {
  vi.mocked(groupAPI.create).mockImplementation(() => new Promise(() => {}));
  useUIStore.setState({ isAddGroupOpen: true });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddGroupDialog />
    </QueryClientProvider>,
  );
  const input = await screen.findByRole("textbox");
  await userEvent.type(input, keys);
}

describe("AddGroupDialog Enter key", () => {
  // Enter while the first create is still pending must not send a second create.
  it("creates the group once for two quick Enters", async () => {
    await typeName("Gardening Weekly{Enter}{Enter}");
    expect(groupAPI.create).toHaveBeenCalledTimes(1);
  });

  // Control: one Enter sends exactly one create.
  it("creates the group once for one Enter", async () => {
    await typeName("Gardening Weekly{Enter}");
    expect(groupAPI.create).toHaveBeenCalledTimes(1);
  });
});
