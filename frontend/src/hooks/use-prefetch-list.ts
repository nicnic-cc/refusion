import { useMemo } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchItemList } from "@/queries/items";
import { parseFilter } from "./use-url-state";

// Stable identity and no URL subscription: it reads the current filter when
// called, so memoized sidebar rows are not re-rendered on navigation.
export function usePrefetchList() {
  const qc = useQueryClient();
  const router = useRouter();

  return useMemo(
    () => (target: { feedId: number | null; groupId: number | null }) => {
      const matches = router.state.matches;
      const params = (matches[matches.length - 1]?.params ?? {}) as {
        filter?: string;
      };
      prefetchItemList(qc, target, parseFilter(params.filter));
    },
    [qc, router],
  );
}
