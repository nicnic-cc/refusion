import { useEffect, useMemo, type RefObject } from "react";
import { useI18n } from "@/lib/i18n";
import { useStartPull } from "@/queries/pull";
import { usePullStore } from "@/store/pull";
import { usePullToRefresh } from "./use-pull-to-refresh";

interface Options {
  containerRef: RefObject<HTMLElement | null>;
  feedId: number | null | undefined;
  groupId: number | null | undefined;
  starred: boolean;
  // Feed or folder name; omitted when the list shows all feeds.
  name?: string;
}

/** Pull-to-refresh for the article list: checks only what the list shows. */
export function useListPull({
  containerRef,
  feedId,
  groupId,
  starred,
  name,
}: Options) {
  const { t } = useI18n();
  const { mutate: startPull } = useStartPull();
  const isIdle = usePullStore((s) => s.phase === "idle");
  const setListScope = usePullStore((s) => s.setListScope);

  const scope = useMemo(() => {
    if (starred) return null;
    if (feedId) return { feed_id: feedId };
    if (groupId) return { group_id: groupId };
    return {};
  }, [starred, feedId, groupId]);

  // The r key reads the scope from the store, so it works without a list ref.
  useEffect(() => {
    setListScope(scope);
    return () => setListScope(null);
  }, [scope, setListScope]);

  const { distance, armed } = usePullToRefresh({
    containerRef,
    enabled: scope !== null && isIdle,
    onRefresh: () => {
      if (scope) startPull({ pane: "list", scope });
    },
  });

  return { distance, armed, scopeName: name ?? t("pull.scopeAll") };
}
