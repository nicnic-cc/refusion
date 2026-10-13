import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { parseFilter } from "@/hooks/use-url-state";
import { API_BASE } from "@/lib/api/client";
import {
  apiErrorMessage,
  type Feed,
  type MarkScopeReadRequest,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { parsePositiveIntegerParam } from "@/lib/route-params";
import { queryKeys } from "@/queries/keys";
import { useMarkItemsRead, useMarkScopeRead } from "@/queries/items";
import { articleListKey, useArticlePinsStore } from "@/store/article-pins";
import {
  UNDO_WINDOW_MS,
  isFeedCovered,
  usePendingFeedReadsStore,
} from "@/store/pending-feed-reads";

// Read at commit time, when the caller may be unmounted and the user elsewhere.
// Only the unread view pins; other views have nothing to keep on screen.
function openUnreadListKey(router: ReturnType<typeof useRouter>) {
  const matches = router.state.matches;
  const params = (matches[matches.length - 1]?.params ?? {}) as {
    filter?: string;
    feedId?: string;
    groupId?: string;
  };
  const filter = parseFilter(params.filter);
  if (filter !== "unread") return null;
  return articleListKey(
    parsePositiveIntegerParam(params.feedId),
    parsePositiveIntegerParam(params.groupId),
    filter,
  );
}

const toastId = (scope: string) => `read-${scope}`;

export function undoDeferredRead(scope: string) {
  usePendingFeedReadsStore.getState().cancel(scope);
  toast.dismiss(toastId(scope));
}

// Same requests as the api client; keepalive lets them outlive the page.
function keepalivePatch(path: string, body: unknown) {
  void fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    keepalive: true,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

interface DeferredRead {
  /** Pending-store key, see pendingScope. */
  scope: string;
  /** Scope name for the toast: feed or folder name, All, Starred. */
  name: string;
  count: number;
  /**
   * A scope mark covers the server side up to request.max_id; loadedIds are
   * the loaded rows to flip, read at commit time. A by-id mark sends just ids.
   */
  mark:
    | { request: MarkScopeReadRequest; loadedIds: () => number[] }
    | { ids: number[] };
}

/**
 * Marks read after a 5 s undo window with a toast. Everything the commit needs
 * is captured at start: the caller may be unmounted by then, and mutateAsync
 * still settles, unlike per-call mutate callbacks.
 */
export function useDeferredScopeRead() {
  const { t } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const { mutateAsync: markScopeRead } = useMarkScopeRead();
  const { mutateAsync: markItemsRead } = useMarkItemsRead();

  return ({ scope, name, count, mark }: DeferredRead) => {
    const failedMessage = t("feed.markRead.failed");
    const pin = (ids: number[]) => {
      const listKey = openUnreadListKey(router);
      if (listKey !== null) {
        useArticlePinsStore.getState().pinItems(listKey, ids);
      }
    };
    const fail = (error: unknown) => {
      toast.error(apiErrorMessage(error, failedMessage));
    };
    // Pending ends at commit, and optimistic deltas only cover loaded rows, so
    // the covered feeds show 0 until the refetch after the request settles.
    const zeroCoveredFeeds = () => {
      void qc.cancelQueries({ queryKey: queryKeys.feeds.all });
      const covered = { [scope]: true } as const;
      qc.setQueryData(queryKeys.feeds.list(), (old: Feed[] | undefined) =>
        old?.map((f) =>
          isFeedCovered(covered, f) ? { ...f, unread_count: 0 } : f,
        ),
      );
    };

    usePendingFeedReadsStore.getState().schedule(scope, {
      commit: () => {
        // sonner pauses its own timer on hover, so Undo could outlive the window.
        toast.dismiss(toastId(scope));
        if ("ids" in mark) {
          pin(mark.ids);
          markItemsRead(mark.ids).catch(fail);
          return;
        }
        const loadedIds = mark.loadedIds();
        pin(loadedIds);
        zeroCoveredFeeds();
        markScopeRead({ request: mark.request, loadedIds }).catch(fail);
      },
      flush: () => {
        if ("ids" in mark) {
          keepalivePatch("/items/-/read", { ids: mark.ids });
        } else {
          keepalivePatch("/items/-/read-all", mark.request);
        }
      },
    });
    toast(
      t(count === 1 ? "feed.markRead.done.one" : "feed.markRead.done.other", {
        count,
        feed: name,
      }),
      {
        id: toastId(scope),
        duration: UNDO_WINDOW_MS,
        // An element replaces sonner's own action button, which fills itself
        // with the text colour (white in dark mode).
        action: (
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto shrink-0"
            onClick={() => undoDeferredRead(scope)}
          >
            <Undo2 />
            {t("feed.markRead.undo")}
          </Button>
        ),
      },
    );
  };
}
