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
import { useUrlState } from "./use-url-state";

const modifierKeys = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);

/**
 * Inoreader-style sidebar tree navigation:
 * Shift+N / Shift+P move the highlight, Shift+J / Shift+K move and open the
 * item, Shift+O opens the focused item and Shift+X expands or collapses its
 * group.
 */
export function useSidebarNavigation(nodes: SidebarNode[]) {
  const { selectTopLevelFilter, setSelectedGroup, setSelectedFeed } =
    useUrlState();
  const isMobile = useIsMobile();
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const setFocusedKey = useSidebarNavStore((s) => s.setFocusedKey);
  const focusedKey = useSidebarNavStore((s) => s.focusedKey);
  const ringVisible = useSidebarNavStore((s) => s.ringVisible);
  const collapsedIds = useCollapsedGroupsStore((s) => s.collapsedIds);
  const setGroupOpen = useCollapsedGroupsStore((s) => s.setGroupOpen);
  const isSearchOpen = useUIStore((s) => s.isSearchOpen);
  const isSettingsOpen = useUIStore((s) => s.isSettingsOpen);
  const isAddGroupOpen = useUIStore((s) => s.isAddGroupOpen);
  const isAddFeedOpen = useUIStore((s) => s.isAddFeedOpen);
  const isEditFeedOpen = useUIStore((s) => s.isEditFeedOpen);
  const isImportOpmlOpen = useUIStore((s) => s.isImportOpmlOpen);
  const isShortcutsOpen = useUIStore((s) => s.isShortcutsOpen);

  const latestStateRef = useRef({
    nodes,
    focusedKey,
    collapsedIds,
    isMobile,
    isSidebarOpen,
    selectTopLevelFilter,
    setSelectedGroup,
    setSelectedFeed,
    setFocusedKey,
    setGroupOpen,
    isSearchOpen,
    isSettingsOpen,
    isAddGroupOpen,
    isAddFeedOpen,
    isEditFeedOpen,
    isImportOpmlOpen,
    isShortcutsOpen,
  });

  useEffect(() => {
    latestStateRef.current = {
      nodes,
      focusedKey,
      collapsedIds,
      isMobile,
      isSidebarOpen,
      selectTopLevelFilter,
      setSelectedGroup,
      setSelectedFeed,
      setFocusedKey,
      setGroupOpen,
      isSearchOpen,
      isSettingsOpen,
      isAddGroupOpen,
      isAddFeedOpen,
      isEditFeedOpen,
      isImportOpmlOpen,
      isShortcutsOpen,
    };
  }, [
    nodes,
    focusedKey,
    collapsedIds,
    isMobile,
    isSidebarOpen,
    selectTopLevelFilter,
    setSelectedGroup,
    setSelectedFeed,
    setFocusedKey,
    setGroupOpen,
    isSearchOpen,
    isSettingsOpen,
    isAddGroupOpen,
    isAddFeedOpen,
    isEditFeedOpen,
    isImportOpmlOpen,
    isShortcutsOpen,
  ]);

  // Keep the highlighted item visible; a mouse click must not scroll the list.
  useEffect(() => {
    if (focusedKey === null || !ringVisible) {
      return;
    }
    document
      .querySelector(`[data-sidebar-key="${focusedKey}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusedKey, ringVisible]);

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

      if (
        state.isSearchOpen ||
        state.isSettingsOpen ||
        state.isAddGroupOpen ||
        state.isAddFeedOpen ||
        state.isEditFeedOpen ||
        state.isImportOpmlOpen ||
        state.isShortcutsOpen
      ) {
        return;
      }

      // On mobile the sidebar lives in a Sheet; ignore chords while it is hidden.
      if (state.isMobile && !state.isSidebarOpen) {
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
          (node) => node.key === state.focusedKey,
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

      const node = state.nodes.find((item) => item.key === state.focusedKey);
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
