// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useMarkAllReadShortcut } from "./use-mark-all-read-shortcut";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function pressShiftA(repeat: boolean) {
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "A",
      shiftKey: true,
      repeat,
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe("useMarkAllReadShortcut key repeat", () => {
  // Holding Shift+A sends repeat keydowns; the handler toggles mark/undo, so a repeat must not call it.
  it("ignores auto-repeated keydown events", () => {
    const onMarkAllRead = vi.fn();
    renderHook(() => useMarkAllReadShortcut(onMarkAllRead, false));
    pressShiftA(true);
    expect(onMarkAllRead).not.toHaveBeenCalled();
  });

  // Control: a first, non-repeat press calls the handler once.
  it("control: a non-repeat press calls the handler once", () => {
    const onMarkAllRead = vi.fn();
    renderHook(() => useMarkAllReadShortcut(onMarkAllRead, false));
    pressShiftA(false);
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });
});
