import { useEffect, useRef } from "react";
import {
  sidebarNodeKey,
  useSidebarNavStore,
  useUIStore,
  type SidebarNode,
} from "@/store";
import { useCollapsedGroupsStore } from "@/store/collapsed-groups";
import { useIsMobile } from "@/hooks/use-mobile";
import { isTypingTarget } from "./use-keyboard";
import { useUrlActions } from "./use-url-state";

const modifierKeys = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);

/**
 * Inoreader-style sidebar tree navigation:
 * Shift+N / Shift+P move the highlight, Shift+J / Shift+K move and open the
 * item, Shift+O opens the focused item and Shift+X expands or collapses its
 * group.
 */
export function useSidebarNavigation(nodes: SidebarNode[]) {
  const { selectTopLevelFilter, setSelectedGroup, setSelectedFeed } =
    useUrlActions();
  const isMobile = useIsMobile();
  const setFocusedKey = useSidebarNavStore((s) => s.setFocusedKey);
  const collapsedIds = useCollapsedGroupsStore((s) => s.collapsedIds);
  const setGroupOpen = useCollapsedGroupsStore((s) => s.setGroupOpen);

  const latestStateRef = useRef({
    nodes,
    collapsedIds,
    isMobile,
    selectTopLevelFilter,
    setSelectedGroup,
    setSelectedFeed,
    setFocusedKey,
    setGroupOpen,
  });

  useEffect(() => {
    latestStateRef.current = {
      nodes,
      collapsedIds,
      isMobile,
      selectTopLevelFilter,
      setSelectedGroup,
      setSelectedFeed,
      setFocusedKey,
      setGroupOpen,
    };
  }, [
    nodes,
    collapsedIds,
    isMobile,
    selectTopLevelFilter,
    setSelectedGroup,
    setSelectedFeed,
    setFocusedKey,
    setGroupOpen,
  ]);

  // Keep the highlighted item visible; a mouse click must not scroll the list.
  // Subscribed outside render so focus moves don't re-render the whole list.
  useEffect(() => {
    const scrollToFocus = (focusedKey: string | null, ringVisible: boolean) => {
      if (focusedKey === null || !ringVisible) {
        return;
      }
      document
        .querySelector(`[data-sidebar-key="${focusedKey}"]`)
        ?.scrollIntoView({ block: "nearest" });
    };
    const initial = useSidebarNavStore.getState();
    scrollToFocus(initial.focusedKey, initial.ringVisible);
    return useSidebarNavStore.subscribe((state, prev) => {
      if (
        state.focusedKey !== prev.focusedKey ||
        state.ringVisible !== prev.ringVisible
      ) {
        scrollToFocus(state.focusedKey, state.ringVisible);
      }
    });
  }, []);

  useEffect(() => {
    const { setRingVisible } = useSidebarNavStore.getState();

    function handleKeyDown(event: KeyboardEvent) {
      // Pressing Shift before N must not hide the ring, so modifiers are skipped.
      if (modifierKeys.has(event.key)) {
        return;
      }
      // Any other key hides the ring; the branches below that act show it again.
      setRingVisible(false);

      if (
        !event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      if (event.defaultPrevented || isTypingTarget(event.target)) {
        return;
      }

      const state = latestStateRef.current;
      const ui = useUIStore.getState();
      const { focusedKey } = useSidebarNavStore.getState();

      if (
        ui.isSearchOpen ||
        ui.isSettingsOpen ||
        ui.isAddGroupOpen ||
        ui.isAddFeedOpen ||
        ui.isEditFeedOpen ||
        ui.isImportOpmlOpen ||
        ui.isShortcutsOpen
      ) {
        return;
      }

      // On mobile the sidebar lives in a Sheet; ignore chords while it is hidden.
      if (state.isMobile && !ui.isSidebarOpen) {
        return;
      }

      const key = event.key.toLowerCase();

      const activate = (node: SidebarNode) => {
        if (node.kind === "filter") {
          state.selectTopLevelFilter(node.filter);
        } else if (node.kind === "group") {
          state.setSelectedGroup(node.groupId);
        } else {
          state.setSelectedFeed(node.feedId);
        }
      };

      if (key === "n" || key === "j" || key === "p" || key === "k") {
        if (state.nodes.length === 0) {
          return;
        }
        event.preventDefault();
        setRingVisible(true);

        const currentIndex = state.nodes.findIndex(
          (node) => node.key === focusedKey,
        );
        const direction = key === "n" || key === "j" ? 1 : -1;
        const nextIndex =
          currentIndex === -1
            ? direction === 1
              ? 0
              : state.nodes.length - 1
            : Math.min(
                Math.max(currentIndex + direction, 0),
                state.nodes.length - 1,
              );

        const nextNode = state.nodes[nextIndex];
        state.setFocusedKey(nextNode.key);

        // Shift+J / Shift+K move and open; Shift+N / Shift+P only move.
        if (key === "j" || key === "k") {
          activate(nextNode);
        }
        return;
      }

      const node = state.nodes.find((item) => item.key === focusedKey);
      if (!node) {
        return;
      }

      if (key === "o") {
        event.preventDefault();
        setRingVisible(true);
        activate(node);
        return;
      }

      if (key === "x") {
        event.preventDefault();
        setRingVisible(true);
        const groupId =
          node.kind === "group"
            ? node.groupId
            : node.kind === "feed"
              ? node.groupId
              : null;
        if (groupId === null) {
          return;
        }
        const willCollapse = !state.collapsedIds.includes(groupId);
        state.setGroupOpen(groupId, !willCollapse);

        // Collapsing the parent hides the focused feed; keep focus on the group.
        if (willCollapse && node.kind === "feed") {
          state.setFocusedKey(sidebarNodeKey.group(groupId));
        }
      }
    }

    function handlePointerDown() {
      setRingVisible(false);
    }

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, []);
}
