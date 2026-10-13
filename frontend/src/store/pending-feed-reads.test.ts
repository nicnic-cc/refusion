// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UNDO_WINDOW_MS,
  isFeedCovered,
  pendingScope,
  usePendingFeedReadsStore,
} from "./pending-feed-reads";

const feed = pendingScope.feed(1);
const other = pendingScope.feed(2);
const covered = (f: { id: number; group_id: number }) =>
  isFeedCovered(usePendingFeedReadsStore.getState().pending, f);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const scope of Object.keys(usePendingFeedReadsStore.getState().pending)) {
    usePendingFeedReadsStore.getState().cancel(scope);
  }
  vi.useRealTimers();
});

describe("pending feed reads", () => {
  it("never commits a cancelled mark", () => {
    const commit = vi.fn();
    const flush = vi.fn();
    const { schedule, cancel } = usePendingFeedReadsStore.getState();
    schedule(feed, { commit, flush });
    expect(usePendingFeedReadsStore.getState().pending[feed]).toBe(true);
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    cancel(feed);
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    expect(commit).not.toHaveBeenCalled();
    expect(usePendingFeedReadsStore.getState().pending[feed]).toBeUndefined();
  });

  it("commits once after the undo window and clears the entry", () => {
    const commit = vi.fn();
    const otherCommit = vi.fn();
    const { schedule } = usePendingFeedReadsStore.getState();
    schedule(feed, { commit, flush: vi.fn() });
    schedule(other, { commit: otherCommit, flush: vi.fn() });
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(otherCommit).toHaveBeenCalledTimes(1);
    expect(usePendingFeedReadsStore.getState().pending).toEqual({});
  });

  it("flushes every pending mark once on pagehide and never commits later", () => {
    const first = { commit: vi.fn(), flush: vi.fn() };
    const second = { commit: vi.fn(), flush: vi.fn() };
    const { schedule } = usePendingFeedReadsStore.getState();
    schedule(feed, first);
    schedule(other, second);
    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    expect(first.flush).toHaveBeenCalledTimes(1);
    expect(second.flush).toHaveBeenCalledTimes(1);
    expect(first.commit).not.toHaveBeenCalled();
    expect(second.commit).not.toHaveBeenCalled();
    expect(usePendingFeedReadsStore.getState().pending).toEqual({});
  });

  it("does not flush a mark that was undone", () => {
    const undone = { commit: vi.fn(), flush: vi.fn() };
    const { schedule, cancel } = usePendingFeedReadsStore.getState();
    schedule(feed, undone);
    cancel(feed);
    window.dispatchEvent(new Event("pagehide"));
    expect(undone.flush).not.toHaveBeenCalled();
  });

  it("covers a feed by its own mark, its group's or all, and cancel lifts it", () => {
    const { schedule, cancel } = usePendingFeedReadsStore.getState();
    const f = { id: 1, group_id: 7 };
    const noop = { commit: vi.fn(), flush: vi.fn() };
    expect(covered(f)).toBe(false);

    schedule(pendingScope.group(7), noop);
    expect(covered(f)).toBe(true);
    expect(covered({ id: 2, group_id: 8 })).toBe(false);
    cancel(pendingScope.group(7));
    expect(covered(f)).toBe(false);

    schedule(pendingScope.all, noop);
    expect(covered({ id: 2, group_id: 8 })).toBe(true);
    cancel(pendingScope.all);
    expect(covered({ id: 2, group_id: 8 })).toBe(false);

    schedule(pendingScope.feed(1), noop);
    expect(covered(f)).toBe(true);
    expect(covered({ id: 2, group_id: 7 })).toBe(false);
  });

  it("a starred mark covers no feed", () => {
    const { schedule } = usePendingFeedReadsStore.getState();
    schedule(pendingScope.starred, { commit: vi.fn(), flush: vi.fn() });
    expect(covered({ id: 1, group_id: 7 })).toBe(false);
  });

  it("keeps marks of different scopes apart and commits a group mark", () => {
    const { schedule, cancel } = usePendingFeedReadsStore.getState();
    const group = { commit: vi.fn(), flush: vi.fn() };
    const all = { commit: vi.fn(), flush: vi.fn() };
    schedule(pendingScope.group(3), group);
    schedule(pendingScope.all, all);
    cancel(pendingScope.all);
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(group.commit).toHaveBeenCalledTimes(1);
    expect(all.commit).not.toHaveBeenCalled();
  });
});
