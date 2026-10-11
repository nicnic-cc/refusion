export type Move = "up" | "down" | "top" | "bottom";

/** Returns a new array with `id` moved; unchanged copy if it can't move that way. */
export function moveId<T>(ids: readonly T[], id: T, move: Move): T[] {
  const from = ids.indexOf(id);
  if (from === -1) return [...ids];

  const to = {
    up: from - 1,
    down: from + 1,
    top: 0,
    bottom: ids.length - 1,
  }[move];
  if (to < 0 || to >= ids.length) return [...ids];

  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
