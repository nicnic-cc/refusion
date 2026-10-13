import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchFeedWebCSS } from "@/queries/feed-web-css";
import { prefetchFilterViews } from "@/queries/feed-filters";

export function usePrefetchFilterViews() {
  const qc = useQueryClient();
  useEffect(() => {
    void prefetchFilterViews(qc);
    void prefetchFeedWebCSS(qc);
  }, [qc]);
}
