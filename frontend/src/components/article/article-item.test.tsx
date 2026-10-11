// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Item } from "@/lib/api";
import { ArticleItem } from "./article-item";

const article = {
  id: 7,
  feed_id: 1,
  title: "Invented headline",
  link: "https://a.test/post",
  unread: true,
  filtered: false,
  filtered_global: false,
  pub_date: 1700000000,
} as Item;

function setup() {
  const props = {
    onSelectArticle: vi.fn(),
    onToggleRead: vi.fn(async () => {}),
    onToggleStar: vi.fn(async () => {}),
  };
  render(
    <ArticleItem
      article={article}
      isSelected={false}
      canToggleRead
      isStarred={false}
      feedName="Feed"
      feedFaviconUrl={null}
      {...props}
    />,
  );
  return props;
}

afterEach(cleanup);

describe("ArticleItem keyboard", () => {
  // Enter on the focused star button toggles the star and does not open the article.
  it("star button: Enter stars and does not select the row", async () => {
    const props = setup();
    screen.getByLabelText("Star").focus();
    await userEvent.keyboard("{Enter}");
    expect(props.onToggleStar).toHaveBeenCalledTimes(1);
    expect(props.onSelectArticle).not.toHaveBeenCalled();
  });

  // Enter on the focused read button toggles read and does not open the article.
  it("read button: Enter toggles read and does not select the row", async () => {
    const props = setup();
    screen.getByLabelText("Mark as read").focus();
    await userEvent.keyboard("{Enter}");
    expect(props.onToggleRead).toHaveBeenCalledTimes(1);
    expect(props.onSelectArticle).not.toHaveBeenCalled();
  });
});
