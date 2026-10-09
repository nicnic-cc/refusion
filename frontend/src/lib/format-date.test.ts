import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePreferencesStore } from "@/store/preferences";
import { absoluteDateOptions, formatDate } from "./utils";

const now = new Date(2026, 9, 9, 15, 0, 0);
const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const expected = (d: Date) =>
  new Intl.DateTimeFormat("en", absoluteDateOptions(d, now)).format(d);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  usePreferencesStore.getState().setLocale("en");
});

afterEach(() => {
  usePreferencesStore.getState().setDateFormat("relative");
  vi.useRealTimers();
});

describe("formatDate absolute mode", () => {
  beforeEach(() => usePreferencesStore.getState().setDateFormat("absolute"));

  it("shows time only for today", () => {
    const d = new Date(2026, 9, 9, 8, 32);
    const out = formatDate(unix(d));
    expect(out).toBe(expected(d));
    expect(out).not.toMatch(/Oct/);
  });

  it("adds month and day earlier this year", () => {
    const d = new Date(2026, 2, 6, 14, 32);
    const out = formatDate(unix(d));
    expect(out).toBe(expected(d));
    expect(out).toMatch(/Mar/);
    expect(out).not.toMatch(/2026/);
  });

  it("adds the year for earlier years", () => {
    const d = new Date(2025, 9, 6, 14, 32);
    const out = formatDate(unix(d));
    expect(out).toBe(expected(d));
    expect(out).toMatch(/2025/);
  });
});

it("keeps relative output by default", () => {
  expect(formatDate(unix(now) - 3 * 3600)).toBe("3 hours ago");
});
