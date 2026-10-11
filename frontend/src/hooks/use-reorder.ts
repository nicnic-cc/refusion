import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { feedAPI, groupAPI, type Feed, type Group } from "@/lib/api";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { useI18n } from "@/lib/i18n";
import { moveId, type Move } from "@/lib/reorder";
import { queryKeys } from "@/queries/keys";

const SAVE_DELAY_MS = 400;

/**
 * Moves groups and feeds in the query cache at once and saves each list
 * (groups, or one group's feeds) as one request after the presses stop.
 */
export function useReorder() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const notifyFailure = useStableCallback(() =>
    toast.error(t("feeds.toast.reorderFailed")),
  );

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, () => Promise<void>>());
  // One request per list at a time, so a flush can't overtake a save in flight.
  const inFlight = useRef(new Map<string, Promise<void>>());

  const send = useCallback(
    (key: string) => {
      clearTimeout(timers.current.get(key));
      timers.current.delete(key);
      const save = pending.current.get(key);
      if (!save) return;
      pending.current.delete(key);

      const listKey =
        key === "groups" ? queryKeys.groups.list() : queryKeys.feeds.list();
      const run = (inFlight.current.get(key) ?? Promise.resolve())
        .then(save)
        // A refetch (e.g. after a pull) may have landed before this save:
        // reload once the last save of this list is in.
        .then(() => {
          if (!pending.current.has(key)) {
            void qc.invalidateQueries({ queryKey: listKey });
          }
        })
        .catch(() => {
          void qc.invalidateQueries({ queryKey: queryKeys.groups.list() });
          void qc.invalidateQueries({ queryKey: queryKeys.feeds.list() });
          notifyFailure();
        });
      inFlight.current.set(key, run);
    },
    [qc, notifyFailure],
  );

  const schedule = useCallback(
    (key: string, save: () => Promise<void>) => {
      pending.current.set(key, save);
      clearTimeout(timers.current.get(key));
      timers.current.set(
        key,
        setTimeout(() => send(key), SAVE_DELAY_MS),
      );
    },
    [send],
  );

  const flush = useCallback(() => {
    for (const key of [...pending.current.keys()]) send(key);
  }, [send]);

  useEffect(() => flush, [flush]);

  const moveGroup = useCallback(
    (groupId: number, move: Move) => {
      void qc.cancelQueries({ queryKey: queryKeys.groups.list() });
      const groups = qc.getQueryData<Group[]>(queryKeys.groups.list()) ?? [];
      const ids = moveId(
        groups.map((g) => g.id),
        groupId,
        move,
      );
      const byId = new Map(groups.map((g) => [g.id, g]));
      qc.setQueryData(
        queryKeys.groups.list(),
        ids.map((id) => byId.get(id)!),
      );
      schedule("groups", async () => {
        await groupAPI.reorder(ids);
      });
    },
    [qc, schedule],
  );

  const moveFeed = useCallback(
    (groupId: number, feedId: number, move: Move) => {
      void qc.cancelQueries({ queryKey: queryKeys.feeds.list() });
      const feeds = qc.getQueryData<Feed[]>(queryKeys.feeds.list()) ?? [];
      const inGroup = feeds.filter((f) => f.group_id === groupId);
      const ids = moveId(
        inGroup.map((f) => f.id),
        feedId,
        move,
      );
      const byId = new Map(inGroup.map((f) => [f.id, f]));
      // Refill the group's slots in the flat list, leaving other groups in place.
      let slot = 0;
      qc.setQueryData(
        queryKeys.feeds.list(),
        feeds.map((f) => (f.group_id === groupId ? byId.get(ids[slot++])! : f)),
      );
      schedule(`feeds:${groupId}`, async () => {
        await feedAPI.reorder(groupId, ids);
      });
    },
    [qc, schedule],
  );

  return { moveGroup, moveFeed, flush };
}
