import { describe, expect, it } from "vitest";
import { articleOpenLink } from "./article-link";

const linked = { link: "https://elsewhere.test/story", permalink: "https://example-news.test/item/42" };

describe("articleOpenLink", () => {
  it("uses the permalink only when the feed opts in", () => {
    expect(articleOpenLink(linked, true)).toBe("https://example-news.test/item/42");
    expect(articleOpenLink(linked, false)).toBe("https://elsewhere.test/story");
  });

  it("falls back to the main link without a permalink", () => {
    expect(articleOpenLink({ link: linked.link, permalink: null }, true)).toBe(linked.link);
  });
});
