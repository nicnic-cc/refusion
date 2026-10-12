export function parsePositiveIntegerParam(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) {
      return null;
    }

    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

// ?article also takes negative ids: a bookmark whose item was deleted is
// listed as -bookmark.id.
export function parseArticleIdParam(value: unknown): number | null {
  if (typeof value === "string" && value.startsWith("-")) {
    const id = parsePositiveIntegerParam(value.slice(1));
    return id === null ? null : -id;
  }
  if (typeof value === "number" && value < 0) {
    const id = parsePositiveIntegerParam(-value);
    return id === null ? null : -id;
  }
  return parsePositiveIntegerParam(value);
}
