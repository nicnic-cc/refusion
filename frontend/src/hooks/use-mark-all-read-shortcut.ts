import { useEffect, useRef } from "react";
import { useUIStore } from "@/store";
import { isLayerOpen, isTypingTarget } from "./use-keyboard";

// Shift+A: same as the mark-all-read button in the article list header.
export function useMarkAllReadShortcut(
  onMarkAllRead: () => void | Promise<void>,
  disabled: boolean,
) {
  const latestRef = useRef({ onMarkAllRead, disabled });

  useEffect(() => {
    latestRef.current = { onMarkAllRead, disabled };
  }, [onMarkAllRead, disabled]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        !event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key.toLowerCase() !== "a"
      ) {
        return;
      }

      if (event.defaultPrevented || isTypingTarget(event.target)) {
        return;
      }

      const { disabled, onMarkAllRead } = latestRef.current;
      if (disabled) {
        return;
      }

      // Read at event time so the listener needs no per-flag subscriptions.
      const ui = useUIStore.getState();
      if (
        ui.isSearchOpen ||
        ui.isSettingsOpen ||
        ui.isAddGroupOpen ||
        ui.isAddFeedOpen ||
        ui.isEditFeedOpen ||
        ui.isImportOpmlOpen ||
        ui.isShortcutsOpen ||
        isLayerOpen()
      ) {
        return;
      }

      event.preventDefault();
      void onMarkAllRead();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
