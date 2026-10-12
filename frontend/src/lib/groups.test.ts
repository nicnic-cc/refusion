import { describe, expect, it } from "vitest";
import type { Feed, Group } from "@/lib/api";
import { DEFAULT_GROUP_ID, getSidebarGroups } from "./groups";

const groups = [
  { id: 2, name: "Gardening" },
  { id: DEFAULT_GROUP_ID, name: "Recipes" },
] as Group[];

describe("getSidebarGroups", () => {
  it("hides the default group while it has no feeds", () => {
    const feeds = [{ id: 10, group_id: 2 }] as Feed[];
    expect(getSidebarGroups(groups, feeds).map((g) => g.id)).toEqual([2]);
  });

  it("shows the default group once it has a feed", () => {
    const feeds = [{ id: 10, group_id: DEFAULT_GROUP_ID }] as Feed[];
    expect(getSidebarGroups(groups, feeds).map((g) => g.id)).toEqual([2, 1]);
  });
});
