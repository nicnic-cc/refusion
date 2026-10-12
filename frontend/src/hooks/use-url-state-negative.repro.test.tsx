import { describe, expect, it } from "vitest";
import { parseArticleIdParam } from "@/lib/route-params";

// useUrlState derives selectedArticleId via parseArticleIdParam(?article), so this
// tests that parse (a router harness for useUrlState is not needed to see the bug).
describe("article search param parsing", () => {
  // A deleted bookmark's article id is negative (-bookmark.id); ?article=-5 must select -5.
  it("keeps a negative bookmark id from ?article=-5", () => {
    expect(parseArticleIdParam("-5")).toBe(-5);
  });

  // Control: a regular positive id parses.
  it("parses a positive id", () => {
    expect(parseArticleIdParam("5")).toBe(5);
  });
});
