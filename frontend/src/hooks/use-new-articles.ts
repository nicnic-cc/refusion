import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ArticleFilter } from "@/lib/article-filter";
import { queryKeys } from "@/queries/keys";
import { useItems } from "@/queries/items";
import { useIncludeFiltered } from "@/hooks/use-show-filtered";
import { newCountQueries, usePullStatus } from "@/queries/pull";
import { usePullStore } from "@/store/pull";

const TINT_MS = 2200;

interface Snapshot {
  key: string;
  // Highest item id the server had when this view's list was read.
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

  // Same query as the list's own observer; only its data is read here.
  const items = useItems(
    { feedId, groupId, unread: unread ? true : undefined, includeFiltered },
    enabled,
  );
  // Highest item id the server had when the list's first page was read.
  const listSnapshotId = items.data?.pages[0]?.snapshot_id;

  // A refetch keeps only the first page, so a long list shrinks under the
  // scroll offset; start it at the top rather than at the clamped end.
  const pageCount = items.data?.pages.length ?? 0;
  const prevPageCount = useRef(pageCount);
  useLayoutEffect(() => {
    if (pageCount < prevPageCount.current) {
      scrollRef.current?.scrollTo({ top: 0 });
    }
    prevPageCount.current = pageCount;
  }, [pageCount, scrollRef]);

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dismissedUpTo, setDismissedUpTo] = useState(0);

  // A refetched list reports a new id: rows above the old one get the tint.
  // Adjusted during render so no frame shows the new list with the old id.
  if (
    enabled &&
    listSnapshotId !== undefined &&
    (snapshot?.key !== viewKey || snapshot.id !== listSnapshotId)
  ) {
    setSnapshot({
      key: viewKey,
      id: listSnapshotId,
      freshAfter: snapshot?.key === viewKey ? snapshot.id : null,
    });
  }

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
