// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { Item } from "@/lib/api";
import type { ArticleViewState } from "@/hooks/use-article-view-state";
import { ArticleView } from "./article-view";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const item = (id: number) =>
  ({
    id,
    feed_id: 0,
    title: `Invented headline ${id}`,
    link: "",
    content: "<p>body</p>",
    unread: false,
    pub_date: 1700000000,
  }) as Item;

function stateFor(article: Item, starred = false) {
  return {
    article,
    readArticle: article,
    canToggleRead: false,
    feed: null,
    bookmark: null,
    starred,
    safeArticleLink: null,
    fullText: null,
    loadingFullText: false,
    canLoadFullText: false,
    hasNext: () => true,
    hasPrevious: () => true,
  } as unknown as ArticleViewState;
}

const viewport = (c: HTMLElement) =>
  c.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;

afterEach(cleanup);

describe("ArticleView scroll", () => {
  // The next article must not open at the previous one's scroll offset.
  it("resets to the top when the article changes, keeps it on re-render", () => {
    const first = item(1);
    const { container, rerender } = render(
      <ArticleView state={stateFor(first)} variant="pane" />,
    );
    viewport(container).scrollTop = 300;

    rerender(<ArticleView state={stateFor(first, true)} variant="pane" />);
    expect(viewport(container).scrollTop).toBe(300);

    rerender(<ArticleView state={stateFor(item(2))} variant="pane" />);
    expect(viewport(container).scrollTop).toBe(0);
  });
});

describe("ArticleView body", () => {
  // React 19 re-writes innerHTML whenever the {__html} object is new, which
  // reloads images and drops selection on every unrelated re-render.
  it("keeps the body DOM when a re-render leaves the content unchanged", () => {
    const first = item(1);
    const { container, rerender } = render(
      <ArticleView state={stateFor(first)} variant="pane" />,
    );
    const paragraph = container.querySelector(".typeset-article p");

    rerender(<ArticleView state={stateFor(first, true)} variant="pane" />);
    expect(container.querySelector(".typeset-article p")).toBe(paragraph);
  });
});
