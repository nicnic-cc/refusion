// @vitest-environment jsdom
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ArticlePage } from "./article-page";

const { state, mounts } = vi.hoisted(() => ({
  state: { readingPane: true },
  mounts: { count: 0 },
}));

vi.mock("@/hooks/use-reading-pane", () => ({ useReadingPane: () => state.readingPane }));
vi.mock("@/components/article/article-pane", () => ({
  ArticlePane: () => <div data-testid="pane" />,
}));
vi.mock("@/components/article/article-list", () => ({
  ArticleList: () => {
    useEffect(() => {
      mounts.count++;
    }, []);
    return <div data-testid="list" />;
  },
}));

afterEach(() => {
  cleanup();
  mounts.count = 0;
  state.readingPane = true;
});

describe("article page layout switch", () => {
  // Crossing the panes breakpoint must not reset the list's scroll or refetch it.
  it("keeps the list mounted when the reading pane toggles", () => {
    const view = render(<ArticlePage />);
    const list = view.getByTestId("list");
    expect(view.queryByTestId("pane")).not.toBeNull();

    state.readingPane = false;
    view.rerender(<ArticlePage />);
    expect(view.queryByTestId("pane")).toBeNull();

    state.readingPane = true;
    view.rerender(<ArticlePage />);
    expect(view.queryByTestId("pane")).not.toBeNull();

    expect(view.getByTestId("list")).toBe(list);
    expect(mounts.count).toBe(1);
  });
});
