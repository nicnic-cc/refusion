import { describe, expect, it } from "vitest";
import {
  buildRule,
  parseConditionError,
  wholeWordsApplies,
  type DraftCondition,
} from "./feed-filter";

const cond = (over: Partial<DraftCondition>): DraftCondition => ({
  key: 1,
  trigger: "title",
  operator: "contains",
  value: "x",
  ...over,
});

describe("buildRule", () => {
  it("drops operator and value for picture and video triggers", () => {
    const rule = buildRule({
      action: "keep",
      join: "or",
      wholeWords: true,
      conditions: [
        cond({ trigger: "has_video", operator: "regex", value: "stale" }),
        cond({ value: "deal" }),
      ],
    });
    expect(rule.conditions).toEqual([
      { trigger: "has_video" },
      { trigger: "title", operator: "contains", value: "deal" },
    ]);
  });
});

describe("wholeWordsApplies", () => {
  it("is false when every text row is a regex", () => {
    expect(wholeWordsApplies([cond({ operator: "not_regex" })])).toBe(false);
    expect(
      wholeWordsApplies([cond({ operator: "regex" }), cond({ key: 2 })]),
    ).toBe(true);
  });
});

describe("parseConditionError", () => {
  it("attributes the server's numbered messages to a zero-based row", () => {
    expect(parseConditionError("condition 2: value is empty")).toEqual({
      index: 1,
      message: "value is empty",
    });
    expect(
      parseConditionError(
        "invalid: condition 1: invalid regex: error parsing regexp: missing closing ): `(?i)(`",
      ),
    ).toEqual({
      index: 0,
      message: "invalid regex: error parsing regexp: missing closing ): `(?i)(`",
    });
    expect(parseConditionError("at least one condition is required")).toEqual({
      index: null,
      message: "at least one condition is required",
    });
  });
});
