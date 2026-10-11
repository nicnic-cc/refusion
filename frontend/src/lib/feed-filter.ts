import type { TranslationKey } from "@/lib/i18n";
import type {
  FilterAction,
  FilterJoin,
  FilterOperator,
  FilterRule,
  FilterTrigger,
} from "@/lib/api";

export const TEXT_TRIGGERS = [
  "title",
  "content",
  "title_or_content",
  "url",
  "url_path",
] as const satisfies readonly FilterTrigger[];

export const MEDIA_TRIGGERS = [
  "has_pictures",
  "no_pictures",
  "has_video",
  "no_video",
] as const satisfies readonly FilterTrigger[];

export const TRIGGERS: readonly FilterTrigger[] = [
  ...TEXT_TRIGGERS,
  ...MEDIA_TRIGGERS,
];

export const OPERATORS: readonly FilterOperator[] = [
  "contains",
  "not_contains",
  "is",
  "is_not",
  "begins_with",
  "ends_with",
  "regex",
  "not_regex",
];

export const TRIGGER_LABELS: Record<FilterTrigger, TranslationKey> = {
  title: "feedFilter.trigger.title",
  content: "feedFilter.trigger.content",
  title_or_content: "feedFilter.trigger.titleOrContent",
  url: "feedFilter.trigger.url",
  url_path: "feedFilter.trigger.urlPath",
  has_pictures: "feedFilter.trigger.hasPictures",
  no_pictures: "feedFilter.trigger.noPictures",
  has_video: "feedFilter.trigger.hasVideo",
  no_video: "feedFilter.trigger.noVideo",
};

export const OPERATOR_LABELS: Record<FilterOperator, TranslationKey> = {
  contains: "feedFilter.operator.contains",
  not_contains: "feedFilter.operator.notContains",
  is: "feedFilter.operator.is",
  is_not: "feedFilter.operator.isNot",
  begins_with: "feedFilter.operator.beginsWith",
  ends_with: "feedFilter.operator.endsWith",
  regex: "feedFilter.operator.regex",
  not_regex: "feedFilter.operator.notRegex",
};

export interface DraftCondition {
  // Stable React key; rows can be removed from the middle.
  key: number;
  trigger: FilterTrigger;
  operator: FilterOperator;
  value: string;
}

export interface DraftRule {
  action: FilterAction;
  join: FilterJoin;
  wholeWords: boolean;
  conditions: DraftCondition[];
}

export function isMediaTrigger(trigger: FilterTrigger): boolean {
  return (MEDIA_TRIGGERS as readonly FilterTrigger[]).includes(trigger);
}

export function isRegexOperator(operator: FilterOperator): boolean {
  return operator === "regex" || operator === "not_regex";
}

// Whole-words only applies to text rows that don't use a regex.
export function wholeWordsApplies(conditions: DraftCondition[]): boolean {
  return conditions.some(
    (c) => !isMediaTrigger(c.trigger) && !isRegexOperator(c.operator),
  );
}

export function isConditionComplete(c: DraftCondition): boolean {
  return isMediaTrigger(c.trigger) || c.value.trim() !== "";
}

// Mirrors the server's compile step so a typo costs no request.
export function regexError(c: DraftCondition): string | null {
  if (
    isMediaTrigger(c.trigger) ||
    !isRegexOperator(c.operator) ||
    c.value.trim() === ""
  ) {
    return null;
  }
  try {
    new RegExp(c.value, "i");
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export function buildRule(draft: DraftRule): FilterRule {
  return {
    action: draft.action,
    join: draft.join,
    whole_words: draft.wholeWords,
    conditions: draft.conditions.map((c) =>
      isMediaTrigger(c.trigger)
        ? { trigger: c.trigger }
        : { trigger: c.trigger, operator: c.operator, value: c.value },
    ),
  };
}

// Server errors about one row contain "condition N: " (1-based), after a prefix like "invalid: ".
export function parseConditionError(message: string): {
  index: number | null;
  message: string;
} {
  const match = /(?:^|: )condition (\d+): (.*)$/s.exec(message);
  if (!match) return { index: null, message };
  return { index: Number(match[1]) - 1, message: match[2] };
}
