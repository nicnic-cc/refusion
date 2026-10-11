import { useEffect, useRef, useState, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ArticleFilter } from "@/lib/article-filter";
import { queryKeys } from "@/queries/keys";
import { useItems } from "@/queries/items";
import { useIncludeFiltered } from "@/hooks/use-show-filtered";
import { newCountQueries, pullQueries, usePullStatus } from "@/queries/pull";
import { usePullStore } from "@/store/pull";

const TINT_MS = 2200;

interface Snapshot {
  key: string;
  // Highest item id the server had right after this view's list was fetched.
  id: number;
  // Rows above this id get the fade-out tint; null on the first load of a view.
  freshAfter: number | null;
}

interface Options {
  feedId: number | null;
  groupId: number | null;
  articleFilter: ArticleFilter;
  articleCount: number;
  scrollRef: RefObject<HTMLElement | null>;
}

/**
 * Tells the open list about articles saved after it was loaded, without
 * changing it: a count for the pill, and the id above which rows are fresh.
 */
export function useNewArticles({
  feedId,
  groupId,
  articleFilter,
  articleCount,
  scrollRef,
}: Options) {
  const qc = useQueryClient();
  const enabled = articleFilter !== "starred";
  const unread = articleFilter === "unread";
  const viewKey = `${feedId ?? ""}|${groupId ?? ""}|${unread}`;

  const includeFiltered = useIncludeFiltered(feedId);

  // Same query as the list's own observer; only its fetch state is read here.
  const items = useItems(
    { feedId, groupId, unread: unread ? true : undefined, includeFiltered },
    enabled,
  );
  const fetching = items.isFetching && !items.isFetchingNextPage;
  const hasData = items.data !== undefined;

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const snapshotKey = snapshot?.key;
  const wasFetching = useRef(false);
  const [dismissedUpTo, setDismissedUpTo] = useState(0);

  // A finished fetch (or the first sight of a view) takes a fresh snapshot.
  useEffect(() => {
    if (!enabled) {
      wasFetching.current = false;
      return;
    }
    if (fetching) {
      wasFetching.current = true;
      return;
    }
    if (!hasData) return;
    const sameView = snapshotKey === viewKey;
    if (!wasFetching.current && sameView) return;
    wasFetching.current = false;

    let stale = false;
    void qc
      .fetchQuery({ ...pullQueries.status(), staleTime: 0 })
      .then((status) => {
        if (stale) return;
        setSnapshot((cur) => ({
          key: viewKey,
          id: status.last_item_id,
          freshAfter: cur?.key === viewKey ? cur.id : null,
        }));
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [enabled, fetching, hasData, viewKey, snapshotKey, qc]);

  useEffect(() => {
    if (snapshot?.freshAfter == null) return;
    const timer = window.setTimeout(
      () =>
        setSnapshot((cur) => (cur ? { ...cur, freshAfter: null } : cur)),
      TINT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [snapshot]);

  const lastItemId = usePullStatus().data?.last_item_id ?? 0;
  // A run ends with a list reload, so the pill would only flash meanwhile.
  const pullBusy = usePullStore(
    (s) => s.phase === "starting" || s.phase === "running",
  );
  const snapshotId = snapshot?.key === viewKey ? snapshot.id : null;
  const hasNew =
    enabled &&
    !pullBusy &&
    snapshotId !== null &&
    lastItemId > snapshotId &&
    lastItemId > dismissedUpTo;

  const { data: count = 0 } = useQuery(
    newCountQueries.count(
      {
        after_id: snapshotId ?? 0,
        ...(feedId ? { feed_id: feedId } : {}),
        ...(groupId ? { group_id: groupId } : {}),
      },
      lastItemId,
      hasNew,
    ),
  );
  const newCount = hasNew ? count : 0;

  const reload = () => {
    setDismissedUpTo(lastItemId);
    void qc.invalidateQueries({ queryKey: queryKeys.items.lists() });
  };

  const emptyReloadedFor = useRef(0);
  // An empty list has nothing to keep still, so new articles just appear.
  useEffect(() => {
    if (newCount > 0 && articleCount === 0 && lastItemId > emptyReloadedFor.current) {
      emptyReloadedFor.current = lastItemId;
      void qc.invalidateQueries({ queryKey: queryKeys.items.lists() });
    }
  }, [newCount, articleCount, lastItemId, qc]);

  const showNew = () => {
    scrollRef.current?.scrollTo({ top: 0 });
    reload();
  };

  return {
    newCount: articleCount > 0 ? newCount : 0,
    showNew,
    freshAfter: snapshot?.key === viewKey ? snapshot.freshAfter : null,
    snapshotId,
  };
}
