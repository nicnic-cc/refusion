import { describe, expect, it } from "vitest";
import type { Feed } from "@/lib/api";
import { getVisibleFeedIds } from "./sidebar-visible";

function feed(id: number, groupId: number, unread: number, error = ""): Feed {
  return {
    id,
    group_id: groupId,
    unread_count: unread,
    fetch_state: { last_error: error },
  } as Feed;
}

const feeds = [
  feed(1, 10, 3), // unread
  feed(2, 10, 0), // read, same group as 1
  feed(3, 20, 0), // read
  feed(4, 30, 0, "timeout"), // read, broken
  feed(5, 40, 0), // read
];

const base = {
  feeds,
  filter: "unread" as const,
  starredFeedIds: new Set<number>(),
  selectedFeedId: null,
  selectedGroupId: null,
  stickyIds: new Set<number>(),
};

describe("getVisibleFeedIds", () => {
  it("unread: hides feeds without unread articles", () => {
    expect([...getVisibleFeedIds(base)].sort()).toEqual([1, 4]);
  });

  it("unread: keeps the selected feed", () => {
    expect(getVisibleFeedIds({ ...base, selectedFeedId: 3 }).has(3)).toBe(true);
  });

  it("unread: keeps every feed of the selected group", () => {
    const visible = getVisibleFeedIds({ ...base, selectedGroupId: 10 });
    expect(visible.has(2)).toBe(true);
    expect(visible.has(3)).toBe(false);
  });

  it("unread: keeps feeds with a fetch error", () => {
    expect(getVisibleFeedIds(base).has(4)).toBe(true);
  });

  it("unread: keeps sticky feeds", () => {
    const stickyIds = new Set([5]);
    expect(getVisibleFeedIds({ ...base, stickyIds }).has(5)).toBe(true);
  });

  it("starred: shows only feeds with a bookmark", () => {
    const visible = getVisibleFeedIds({
      ...base,
      filter: "starred",
      starredFeedIds: new Set([2]),
    });
    expect([...visible].sort()).toEqual([2, 4]);
  });

  it("all: shows everything", () => {
    const visible = getVisibleFeedIds({ ...base, filter: "all" });
    expect(visible.size).toBe(feeds.length);
  });
});
