// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useMarkAllReadShortcut } from "./use-mark-all-read-shortcut";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function pressShiftA(target: EventTarget) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: "A", shiftKey: true, bubbles: true, cancelable: true }),
  );
}

describe("useMarkAllReadShortcut with a Base UI layer open", () => {
  // Shift+A must not mark everything read while a popover/menu/sheet is open.
  it("does not fire while a dialog layer is open", () => {
    const onMarkAllRead = vi.fn();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("data-open", "");
    const button = document.createElement("button");
    dialog.appendChild(button);
    document.body.appendChild(dialog);
    button.focus();
    renderHook(() => useMarkAllReadShortcut(onMarkAllRead, false));
    pressShiftA(button);
    expect(onMarkAllRead).not.toHaveBeenCalled();
  });

  // Control: with no layer open the shortcut fires.
  it("fires when no layer is open", () => {
    const onMarkAllRead = vi.fn();
    renderHook(() => useMarkAllReadShortcut(onMarkAllRead, false));
    pressShiftA(document.body);
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });
});
