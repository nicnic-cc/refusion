// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useUIStore } from "@/store";
import { useKeyboardShortcuts } from "./use-keyboard";

const setSelectedArticle = vi.fn();
vi.mock("./use-url-state", () => ({
  useUrlState: () => ({
    selectedArticleId: 5,
    setSelectedArticle,
    selectTopLevelFilter: vi.fn(),
  }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/queries/pull", () => ({ useStartPull: () => ({ mutate: vi.fn() }) }));

afterEach(() => {
  cleanup();
  setSelectedArticle.mockClear();
  useUIStore.setState({ isEditFeedOpen: false, isAddFeedOpen: false });
});

describe("useKeyboardShortcuts Escape", () => {
  // Escape with the edit-feed dialog open must not deselect the article behind it.
  it("keeps the selected article while the edit-feed dialog is open", () => {
    useUIStore.setState({ isEditFeedOpen: true });
    renderHook(() => useKeyboardShortcuts());
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(setSelectedArticle).not.toHaveBeenCalled();
  });

  // Same for the add-feed dialog.
  it("keeps the selected article while the add-feed dialog is open", () => {
    useUIStore.setState({ isAddFeedOpen: true });
    renderHook(() => useKeyboardShortcuts());
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(setSelectedArticle).not.toHaveBeenCalled();
  });
});

describe("useKeyboardShortcuts with a DOM popup open", () => {
  // Local-state dialogs set no store flag; only their Base UI popup markup shows they are open.
  it("ignores / and Escape while a Base UI dialog is open", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("data-open", "");
    document.body.appendChild(dialog);
    try {
      renderHook(() => useKeyboardShortcuts());
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(useUIStore.getState().isSearchOpen).toBe(false);
      expect(setSelectedArticle).not.toHaveBeenCalled();
    } finally {
      dialog.remove();
    }
  });

  // The article drawer is a Sheet too, but Escape there still closes the article.
  it("still handles Escape inside the article drawer", () => {
    const drawer = document.createElement("div");
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("data-open", "");
    drawer.setAttribute("data-hotkey-surface", "");
    document.body.appendChild(drawer);
    try {
      renderHook(() => useKeyboardShortcuts());
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(setSelectedArticle).toHaveBeenCalledWith(null);
    } finally {
      drawer.remove();
    }
  });
});
