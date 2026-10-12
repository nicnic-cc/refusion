import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import {
  pullAPI,
  type NewCountParams,
  type PullStatus,
  type StartPullRequest,
} from "@/lib/api";
import { usePullStore, type PullPane } from "@/store/pull";
import { queryKeys } from "./keys";

const POLL_BUSY_MS = 1000;
const POLL_IDLE_MS = 60_000;

export const pullQueryKey = ["pull", "status"] as const;

export const pullQueries = {
  status: () =>
    queryOptions({
      queryKey: pullQueryKey,
      queryFn: async () => {
        const res = await pullAPI.status();
        return res.data!;
      },
      refetchInterval: (query) =>
        query.state.data?.pending.length ? POLL_BUSY_MS : POLL_IDLE_MS,
      // Polling pauses while the tab is hidden; ask again as soon as it is back.
      refetchOnWindowFocus: "always",
    }),
};

export const newCountQueries = {
  // upTo (the server's last_item_id) is in the key so each new arrival asks again.
  count: (params: NewCountParams, upTo: number, enabled: boolean) =>
    queryOptions({
      queryKey: ["pull", "new-count", params, upTo] as const,
      queryFn: async () => {
        const res = await pullAPI.newCount(params);
        return res.data!.count;
      },
      enabled,
      placeholderData: (prev) => prev,
    }),
};

export function usePullStatus() {
  return useQuery(pullQueries.status());
}

// The open list stays as it is (the "N new" pill offers the reload); only a
// one-page list scrolled to the top reloads in place. Other lists are marked
// stale and load fresh when opened.
function refreshItemLists(qc: QueryClient) {
  void qc.invalidateQueries({
    queryKey: queryKeys.items.all,
    refetchType: "none",
  });
  if (!usePullStore.getState().listAtTop) return;
  void qc.refetchQueries({
    queryKey: queryKeys.items.lists(),
    type: "active",
    predicate: (query) =>
      ((query.state.data as InfiniteData<unknown> | undefined)?.pages.length ??
        0) <= 1,
  });
}

/**
 * Moves the pull store forward for one status reading. `queued` is only known
 * right after a start request; there 0 means nothing was fetched.
 */
export function applyPullStatus(
  qc: QueryClient,
  status: PullStatus,
  queued?: number,
) {
  const store = usePullStore.getState();
  const pending = status.pending.length;
  if (pending > 0) {
    store.running(pending, status.new_items);
    return;
  }

  const ended =
    store.phase === "running" ||
    (store.phase === "starting" && queued !== undefined);
  if (!ended) return;

  if (queued === 0) {
    store.finish(0);
    return;
  }
  void qc.invalidateQueries({ queryKey: queryKeys.feeds.all });
  refreshItemLists(qc);
  store.finish(Math.max(0, status.new_items - store.baseline));
}

interface StartPullVars {
  pane?: PullPane;
  scope?: StartPullRequest;
}

export function useStartPull() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: StartPullVars | void) => {
      const res = await pullAPI.start(vars?.scope ?? {});
      return res.data!;
    },
    onMutate: (vars) => {
      const known = qc.getQueryData<PullStatus>(pullQueryKey);
      usePullStore.getState().starting(known?.new_items ?? 0, vars?.pane ?? null);
    },
    onSuccess: async ({ queued }) => {
      const status = await qc.fetchQuery({
        ...pullQueries.status(),
        staleTime: 0,
      });
      applyPullStatus(qc, status, queued);
    },
    onError: () => usePullStore.getState().reset(),
  });
}
