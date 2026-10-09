import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import DOMPurify from "dompurify";
import { getDateFormat, getPreferredLocale } from "@/store/preferences";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function unixToDate(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

// Options are shared with the test so it compares against Intl, not strings.
export function absoluteDateOptions(
  date: Date,
  now: Date,
): Intl.DateTimeFormatOptions {
  const time = { hour: "numeric", minute: "numeric" } as const;
  if (date.toDateString() === now.toDateString()) return time;
  const monthDay = { month: "short", day: "numeric", ...time } as const;
  return date.getFullYear() === now.getFullYear()
    ? monthDay
    : { ...monthDay, year: "numeric" };
}

export function formatDate(timestamp: number): string {
  const date = unixToDate(timestamp);
  const locale = getPreferredLocale();
  const now = new Date();
  if (getDateFormat() === "absolute") {
    return new Intl.DateTimeFormat(
      locale,
      absoluteDateOptions(date, now),
    ).format(date);
  }
  const diff = now.getTime() - date.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return rtf.format(0, "second");
  if (minutes < 60) return rtf.format(-minutes, "minute");
  if (hours < 24) return rtf.format(-hours, "hour");
  if (days < 7) return rtf.format(-days, "day");

  return date.toLocaleDateString(locale);
}

export function extractSummary(html: string, maxLength = 120): string {
  // Take textContent: the string output would re-escape entities (&nbsp;, &amp;).
  const clean =
    DOMPurify.sanitize(html, { ALLOWED_TAGS: [], RETURN_DOM_FRAGMENT: true })
      .textContent ?? "";
  // Normalize whitespace
  const text = clean.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  // Truncate and add ellipsis
  return text.slice(0, maxLength).trimEnd() + "…";
}
