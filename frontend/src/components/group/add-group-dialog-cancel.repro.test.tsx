// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useUIStore } from "@/store";
import { AddGroupDialog } from "./add-group-dialog";

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
  useUIStore.setState({ isAddGroupOpen: false });
});

const waitForClosed = () =>
  act(() => new Promise<void>((r) => setTimeout(r, 100)));

async function typeThenClose(close: () => Promise<void>) {
  useUIStore.setState({ isAddGroupOpen: true });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddGroupDialog />
    </QueryClientProvider>,
  );
  await userEvent.type(await screen.findByRole("textbox"), "Invented Group");
  await close();
  await waitForClosed();
  act(() => useUIStore.setState({ isAddGroupOpen: true }));
  return (await screen.findByRole("textbox")) as HTMLInputElement;
}

describe("AddGroupDialog reopened after closing", () => {
  // Cancel must discard the typed name, so a reopened dialog has an empty input.
  it("clears the name after Cancel", async () => {
    const input = await typeThenClose(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    expect(input.value).toBe("");
  });

  // Control: closing with Escape already resets the name.
  it("clears the name after Escape", async () => {
    const input = await typeThenClose(async () => {
      await userEvent.keyboard("{Escape}");
    });
    expect(input.value).toBe("");
  });
});
