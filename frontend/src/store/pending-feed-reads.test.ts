// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UNDO_WINDOW_MS,
  usePendingFeedReadsStore,
} from "./pending-feed-reads";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  usePendingFeedReadsStore.getState().cancel(1);
  usePendingFeedReadsStore.getState().cancel(2);
  vi.useRealTimers();
});

describe("pending feed reads", () => {
  it("never commits a cancelled mark", () => {
    const commit = vi.fn();
    const flush = vi.fn();
    const { schedule, cancel } = usePendingFeedReadsStore.getState();
    schedule(1, { commit, flush });
    expect(usePendingFeedReadsStore.getState().pending[1]).toBe(true);
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    cancel(1);
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    expect(commit).not.toHaveBeenCalled();
    expect(usePendingFeedReadsStore.getState().pending[1]).toBeUndefined();
  });

  it("commits once after the undo window and clears the entry", () => {
    const commit = vi.fn();
    const other = vi.fn();
    const { schedule } = usePendingFeedReadsStore.getState();
    schedule(1, { commit, flush: vi.fn() });
    schedule(2, { commit: other, flush: vi.fn() });
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
    expect(usePendingFeedReadsStore.getState().pending).toEqual({});
  });

  it("flushes every pending mark once on pagehide and never commits later", () => {
    const first = { commit: vi.fn(), flush: vi.fn() };
    const second = { commit: vi.fn(), flush: vi.fn() };
    const { schedule } = usePendingFeedReadsStore.getState();
    schedule(1, first);
    schedule(2, second);
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
    schedule(1, undone);
    cancel(1);
    window.dispatchEvent(new Event("pagehide"));
    expect(undone.flush).not.toHaveBeenCalled();
  });
});
