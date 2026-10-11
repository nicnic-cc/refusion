import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { globalFilterAPI, type SaveFeedFilterRequest } from "@/lib/api";
import { invalidateFilterViews } from "./feed-filters";

const globalFilterKey = ["global-filter"] as const;

export function useGlobalFilter() {
  const query = useQuery({
    queryKey: globalFilterKey,
    queryFn: async () => (await globalFilterAPI.get()).data ?? null,
  });
  return { filter: query.data ?? undefined, isLoading: query.isLoading };
}

// The global filter flips flags in every feed, so all filter views reload.
function invalidateAll(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: globalFilterKey }),
    invalidateFilterViews(qc),
  ]);
}

export function useSaveGlobalFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rule: SaveFeedFilterRequest) => globalFilterAPI.save(rule),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSetGlobalFilterEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => globalFilterAPI.setEnabled(enabled),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteGlobalFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => globalFilterAPI.delete(),
    onSuccess: () => invalidateAll(qc),
  });
}
