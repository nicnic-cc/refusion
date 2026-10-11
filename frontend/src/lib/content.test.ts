// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { processArticleContent } from "./content";

describe("processArticleContent", () => {
  // Feed HTML must not carry utility classes that restyle the app (overlays).
  it("drops the class attribute from feed content", () => {
    const out = processArticleContent('<div class="fixed inset-0 z-50">x</div>');
    expect(out).not.toContain("class=");
  });

  // Real images whose URL merely contains /open/ or /track/ must be kept.
  it.each([
    "https://a.test/open/cover.jpg",
    "https://a.test/track/2024/map.png",
  ])("keeps a content image at %s", (src) => {
    const out = processArticleContent(`<p>t</p><img src="${src}">`);
    expect(out).toContain("<img");
  });

  it("removes a real 1x1 tracking pixel (control)", () => {
    const out = processArticleContent(
      '<p>t</p><img width="1" height="1" src="https://a.test/x.gif">',
    );
    expect(out).not.toContain("<img");
  });

  it.each([
    "https://list-manage.test/track/open.php?u=abc&id=1",
    "https://mailer.test/open.aspx?id=9",
    "https://news.test/track/open/abc123",
  ])("removes the open-tracking image %s", (src) => {
    const out = processArticleContent(`<p>t</p><img src="${src}">`);
    expect(out).not.toContain("<img");
  });

  it("strips width and height from a kept image", () => {
    const out = processArticleContent(
      '<img width="640" height="480" src="https://a.test/photo.jpg">',
    );
    expect(out).toContain("<img");
    expect(out).not.toContain("width=");
    expect(out).not.toContain("height=");
  });
});
