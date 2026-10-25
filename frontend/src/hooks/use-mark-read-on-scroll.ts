import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import type { Item } from "@/lib/api";
import { useMarkItemsRead } from "@/queries/items";
import { articleListKey, useReadStatePins } from "@/store";
import { usePreferencesStore } from "@/store/preferences";

// Same pause the list waits before loading more, so a mark never lands mid-fling.
const FLUSH_DELAY_MS = 200;
// Rects and scrollTop can be fractional: a row resting exactly on the edge counts.
const EDGE_TOLERANCE_PX = 1;

interface MarkReadOnScrollOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  articles: Item[];
  feedId: number | null;
  groupId: number | null;
  articleFilter: string;
}

/**
 * With the per-device setting on, marks an unread row read when its bottom
 * edge crosses the top of the scroll box on a downward scroll, whatever moved
 * it (wheel, touch, or `j` scrolling the selected row into view). Crossed ids
 * are sent as one request once scrolling pauses. Returns whether the setting
 * is on, so the list can add its end spacer.
 */
export function useMarkReadOnScroll({
  scrollRef,
  articles,
  feedId,
  groupId,
  articleFilter,
}: MarkReadOnScrollOptions): boolean {
  const enabled = usePreferencesStore((s) => s.markReadOnScroll);
  const markItemsRead = useMarkItemsRead();
  const { pinRead } = useReadStatePins({ feedId, groupId, articleFilter });
  const pinsKey = articleListKey(feedId, groupId, articleFilter);

  const lastTopRef = useRef(0);
  const queueRef = useRef(new Set<number>());
  const rowsRef = useRef<HTMLElement[] | null>(null);
  const unreadRef = useRef(new Set<number>());

  // Pin before the request, as a toggle does, so the optimistic unread flip
  // cannot drop the rows from the unread view under the user.
  const markRead = useEffectEvent((ids: number[]) => {
    pinRead(ids);
    markItemsRead.mutateAsync(ids).catch((error: unknown) => {
      console.error("Failed to mark scrolled rows read:", error);
    });
  });

  useEffect(() => {
    rowsRef.current = null;
    unreadRef.current = new Set(
      articles.filter((a) => a.unread && a.id > 0).map((a) => a.id),
    );
  }, [articles]);

  // A new list jumps to the top (the list's own layout effect): that jump is
  // not a scroll, and rows queued for the old list are dropped.
  useLayoutEffect(() => {
    lastTopRef.current = 0;
    queueRef.current.clear();
  }, [pinsKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!enabled || !el) return;
    const queue = queueRef.current;
    lastTopRef.current = el.scrollTop;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Rows are in list order, so a binary search finds the first one still
    // below the last seen top; only rows crossed since then are read.
    const check = () => {
      frame = 0;
      const top = el.scrollTop;
      const last = lastTopRef.current;
      lastTopRef.current = top;
      if (top <= last) return;

      rowsRef.current ??= Array.from(
        el.querySelectorAll<HTMLElement>("[data-article-id]"),
      );
      const rows = rowsRef.current;
      const origin = el.getBoundingClientRect().top + el.clientTop - top;
      const bottom = (row: HTMLElement) =>
        row.getBoundingClientRect().bottom - origin;

      let lo = 0;
      let hi = rows.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (bottom(rows[mid]) <= last + EDGE_TOLERANCE_PX) lo = mid + 1;
        else hi = mid;
      }
      for (let i = lo; i < rows.length; i++) {
        if (bottom(rows[i]) > top + EDGE_TOLERANCE_PX) break;
        const id = Number(rows[i].dataset.articleId);
        if (unreadRef.current.has(id)) queue.add(id);
      }
    };

    const flush = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        check();
      }
      const ids = [...queue].filter((id) => unreadRef.current.has(id));
      queue.clear();
      if (ids.length > 0) markRead(ids);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
      clearTimeout(timer);
      timer = setTimeout(flush, FLUSH_DELAY_MS);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      queue.clear();
    };
  }, [enabled, pinsKey, scrollRef]);

  return enabled;
}
