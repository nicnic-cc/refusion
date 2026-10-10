import { useEffect, useRef, useState, type RefObject } from "react";

const VIEWPORT_SELECTOR = "[data-slot=scroll-area-viewport]";
// How far the content moves down: arms at THRESHOLD_PX, stops at MAX_PULL_PX.
const THRESHOLD_PX = 40;
const MAX_PULL_PX = 56;
// Finger or wheel px needed to arm. Wheel needs more: a mouse notch or
// trackpad flick at the top sends 100+ px, which would fire by accident.
const TOUCH_TRAVEL_PX = 128;
const WHEEL_TRAVEL_PX = 220;
const TOUCH_RESISTANCE = THRESHOLD_PX / TOUCH_TRAVEL_PX;
const WHEEL_RESISTANCE = THRESHOLD_PX / WHEEL_TRAVEL_PX;
const LINE_HEIGHT_PX = 16;
// A wheel gesture starts after this much silence and ends after RELEASE_MS.
const GESTURE_GAP_MS = 200;
const RELEASE_MS = 150;

interface Options {
  containerRef: RefObject<HTMLElement | null>;
  onRefresh: () => void;
  enabled?: boolean;
}

function scrollElementOf(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>(VIEWPORT_SELECTOR) ?? container;
}

function shownDistance(rawPx: number, resistance: number): number {
  return Math.min(MAX_PULL_PX, rawPx * resistance);
}

/**
 * Pull-down gesture for a scrollable pane: touch drag, or trackpad wheel.
 * Touch events and wheel events bubble from the scroll viewport inside
 * `containerRef`, so the viewport may mount after the container.
 */
export function usePullToRefresh({
  containerRef,
  onRefresh,
  enabled = true,
}: Options) {
  const [distance, setDistance] = useState(0);
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    let current = 0;
    const show = (px: number) => {
      current = px;
      setDistance(px);
    };
    const release = () => {
      const fire = current >= THRESHOLD_PX;
      show(0);
      if (fire) onRefreshRef.current();
    };

    // Touch: only a drag that starts with the pane resting at the top counts.
    let touchStartY: number | null = null;

    const onTouchStart = (e: TouchEvent) => {
      const atTop = scrollElementOf(container).scrollTop <= 0;
      touchStartY = atTop && e.touches.length === 1 ? e.touches[0].clientY : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchStartY === null) return;
      const dy = e.touches[0].clientY - touchStartY;
      if (dy > 0 && scrollElementOf(container).scrollTop <= 0) {
        if (e.cancelable) e.preventDefault();
        show(shownDistance(dy, TOUCH_RESISTANCE));
      } else if (current > 0) {
        show(0);
      }
    };
    const onTouchEnd = () => {
      touchStartY = null;
      release();
    };

    // Wheel: a trackpad keeps sending momentum events after the fingers lift,
    // so a gesture counts only if it began (after a pause) with the pane
    // already at the top, and stops counting once the pane has scrolled.
    let lastWheelAt = 0;
    let gestureCounts = false;
    let raw = 0;
    let releaseTimer: number | undefined;

    const onWheel = (e: WheelEvent) => {
      const now = performance.now();
      if (now - lastWheelAt >= GESTURE_GAP_MS) {
        gestureCounts = scrollElementOf(container).scrollTop <= 0;
        raw = 0;
      }
      lastWheelAt = now;

      if (scrollElementOf(container).scrollTop > 0) gestureCounts = false;
      if (!gestureCounts) return;

      const unit = e.deltaMode === 1 ? LINE_HEIGHT_PX : 1;
      raw = Math.max(0, raw - e.deltaY * unit);
      if (raw > 0) {
        if (e.cancelable) e.preventDefault();
        show(shownDistance(raw, WHEEL_RESISTANCE));
      } else if (current > 0) {
        show(0);
      }

      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        gestureCounts = false;
        raw = 0;
        release();
      }, RELEASE_MS);
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);
    container.addEventListener("touchcancel", onTouchEnd);
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.clearTimeout(releaseTimer);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
      container.removeEventListener("wheel", onWheel);
      setDistance(0);
    };
  }, [containerRef, enabled]);

  return { distance, armed: distance >= THRESHOLD_PX };
}
