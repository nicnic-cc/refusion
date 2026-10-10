import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { applyPullStatus, usePullStatus } from "@/queries/pull";
import { queryKeys } from "@/queries/keys";

// Mount once (app layout) so progress tracking also runs with the drawer closed.
export function usePullRun() {
  const qc = useQueryClient();
  const { data } = usePullStatus();
  const lastNewItems = useRef<number | null>(null);

  useEffect(() => {
    if (!data) return;
    applyPullStatus(qc, data);

    // Scheduled fetches show no progress, only fresh unread counts.
    if (
      data.pending.length === 0 &&
      lastNewItems.current !== null &&
      lastNewItems.current !== data.new_items
    ) {
      void qc.invalidateQueries({ queryKey: queryKeys.feeds.all });
    }
    lastNewItems.current = data.new_items;
  }, [data, qc]);
}
