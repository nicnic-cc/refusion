import { useCallback, useLayoutEffect, useRef } from "react";

// Stable identity with always-fresh behaviour, so memoized rows are not
// re-rendered just because a handler's dependencies changed.
export function useStableCallback<Args extends unknown[], R>(
  fn: (...args: Args) => R,
): (...args: Args) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}
