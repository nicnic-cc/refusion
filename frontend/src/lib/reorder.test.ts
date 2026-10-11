import { describe, expect, it } from "vitest";
import { moveId } from "./reorder";

describe("moveId", () => {
  const ids = [1, 2, 3, 4];

  it("moves one step and to the ends", () => {
    expect(moveId(ids, 3, "up")).toEqual([1, 3, 2, 4]);
    expect(moveId(ids, 2, "down")).toEqual([1, 3, 2, 4]);
    expect(moveId(ids, 3, "top")).toEqual([3, 1, 2, 4]);
    expect(moveId(ids, 2, "bottom")).toEqual([1, 3, 4, 2]);
  });

  it("leaves the order alone at the edges and for unknown ids", () => {
    expect(moveId(ids, 1, "up")).toEqual(ids);
    expect(moveId(ids, 4, "down")).toEqual(ids);
    expect(moveId(ids, 9, "top")).toEqual(ids);
  });

  it("does not mutate the input", () => {
    moveId(ids, 4, "top");
    expect(ids).toEqual([1, 2, 3, 4]);
  });
});
