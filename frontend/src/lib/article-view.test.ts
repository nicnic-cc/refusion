import { describe, expect, it } from "vitest";
import { toggledView } from "./article-view";

describe("toggledView", () => {
  it("default full: web page leads back to full text, full text to feed text", () => {
    expect(toggledView("full", "web", "full")).toBe("web");
    expect(toggledView("web", "web", "full")).toBe("full");
    expect(toggledView("full", "full", "full")).toBe("feed");
    expect(toggledView("feed", "full", "full")).toBe("full");
  });

  it("default web: full text leads back to the web page, web page to feed text", () => {
    expect(toggledView("web", "full", "web")).toBe("full");
    expect(toggledView("full", "full", "web")).toBe("web");
    expect(toggledView("web", "web", "web")).toBe("feed");
  });

  it("default feed: each key toggles its own view against feed text", () => {
    expect(toggledView("feed", "full", "feed")).toBe("full");
    expect(toggledView("full", "full", "feed")).toBe("feed");
    expect(toggledView("feed", "web", "feed")).toBe("web");
    expect(toggledView("web", "web", "feed")).toBe("feed");
  });
});
