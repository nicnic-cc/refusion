import { useEffect, useState } from "react";

// True only once `flag` has stayed true for `delayMs`: a placeholder that
// appears and vanishes within a fast load reads as a flash.
export function useDelayedFlag(flag: boolean, delayMs: number) {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!flag) return;
    const id = setTimeout(() => setElapsed(true), delayMs);
    return () => {
      clearTimeout(id);
      setElapsed(false);
    };
  }, [flag, delayMs]);

  return flag && elapsed;
}
