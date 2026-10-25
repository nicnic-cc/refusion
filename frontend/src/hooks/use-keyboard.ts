import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useStartPull } from "@/queries/pull";
import { useSidebarNavStore, useUIStore } from "@/store";
import { useNavHighlightStore } from "@/store/nav-highlight";
import { usePullStore } from "@/store/pull";
import { useUrlState } from "./use-url-state";

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  return target.closest("[contenteditable='true'], [data-hotkey-ignore='true']") !== null;
}

// Open Base UI popups (dialog, alert dialog, popover, menu, select list). Exit
// animation sets data-closed/data-ending-style instead of data-open; tooltips have no role.
// The article drawer is a Sheet but is the reading surface, so it opts out.
const OPEN_LAYER_SELECTOR = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
]
  .map(
    (role) =>
      `${role}[data-open]:not([data-ending-style]):not([data-hotkey-surface])`,
  )
  .join(",");

// Search, settings and shortcuts are handled by the callers themselves.
export function isLayerOpen(): boolean {
  const ui = useUIStore.getState();
  return (
    ui.isAddGroupOpen ||
    ui.isAddFeedOpen ||
    ui.isEditFeedOpen ||
    ui.isImportOpmlOpen ||
    document.querySelector(OPEN_LAYER_SELECTOR) !== null
  );
}

interface ArticleNavigationOptions {
  enabled?: boolean;
  onToggleRead?: () => void | Promise<void>;
  onToggleStar?: () => void | Promise<void>;
  onOpenOriginal?: () => void;
  onToggleFullText?: () => void;
  onToggleWebPage?: () => void;
}

export function useKeyboardShortcuts() {
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const setShortcutsOpen = useUIStore((s) => s.setShortcutsOpen);
  const isSearchOpen = useUIStore((s) => s.isSearchOpen);
  const isSettingsOpen = useUIStore((s) => s.isSettingsOpen);
  const isShortcutsOpen = useUIStore((s) => s.isShortcutsOpen);
  const {
    selectedArticleId,
    setSelectedArticle,
    setArticleFilter,
    selectAllFeeds,
  } = useUrlState();
  const navigate = useNavigate();
  const { mutate: startPull } = useStartPull();
  const pendingPrefixRef = useRef<"g" | null>(null);
  const pendingPrefixTimerRef = useRef<number | null>(null);
  const latestStateRef = useRef({
    isSearchOpen,
    isSettingsOpen,
    isShortcutsOpen,
    selectedArticleId,
    setSearchOpen,
    setSettingsOpen,
    setShortcutsOpen,
    setSelectedArticle,
    setArticleFilter,
    selectAllFeeds,
    navigate,
    startPull,
  });

  useEffect(() => {
    latestStateRef.current = {
      isSearchOpen,
      isSettingsOpen,
      isShortcutsOpen,
      selectedArticleId,
      setSearchOpen,
      setSettingsOpen,
      setShortcutsOpen,
      setSelectedArticle,
      setArticleFilter,
      selectAllFeeds,
      navigate,
      startPull,
    };
  }, [
    isSearchOpen,
    isSettingsOpen,
    isShortcutsOpen,
    selectedArticleId,
    setSearchOpen,
    setSettingsOpen,
    setShortcutsOpen,
    setSelectedArticle,
    setArticleFilter,
    selectAllFeeds,
    navigate,
    startPull,
  ]);

  useEffect(() => {
    function resetPrefix() {
      pendingPrefixRef.current = null;
      if (pendingPrefixTimerRef.current !== null) {
        window.clearTimeout(pendingPrefixTimerRef.current);
        pendingPrefixTimerRef.current = null;
      }
    }

    function startPrefix(prefix: "g") {
      resetPrefix();
      pendingPrefixRef.current = prefix;
      pendingPrefixTimerRef.current = window.setTimeout(() => {
        resetPrefix();
      }, 1200);
    }

    function handleKeyDown(event: KeyboardEvent) {
      const state = latestStateRef.current;

      if (event.defaultPrevented) {
        return;
      }

      const key = event.key.toLowerCase();

      // ⌘K or Ctrl+K: Open search
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        state.setSearchOpen(!state.isSearchOpen);
        resetPrefix();
        return;
      }

      // ⌘, or Ctrl+, : Open settings
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        state.setSettingsOpen(true);
        resetPrefix();
        return;
      }

      // ESC: Close modals/drawer
      if (event.key === "Escape") {
        if (state.isSearchOpen) {
          resetPrefix();
          state.setSearchOpen(false);
          return;
        }
        if (state.isSettingsOpen) {
          resetPrefix();
          state.setSettingsOpen(false);
          return;
        }
        if (state.isShortcutsOpen) {
          resetPrefix();
          state.setShortcutsOpen(false);
          return;
        }
        // Another layer is open: let it close itself.
        if (isLayerOpen()) {
          return;
        }
        if (state.selectedArticleId !== null) {
          resetPrefix();
          state.setSelectedArticle(null);
          return;
        }

        // Clear the sidebar highlight when nothing else is open.
        useSidebarNavStore.getState().setFocusedKey(null);
        resetPrefix();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      if (
        state.isSearchOpen ||
        state.isSettingsOpen ||
        state.isShortcutsOpen ||
        isLayerOpen()
      ) {
        return;
      }

      // Shifted keys after "g" are their own chords (Shift+A marks all read).
      if (pendingPrefixRef.current === "g" && event.shiftKey) {
        resetPrefix();
      }

      if (pendingPrefixRef.current === "g") {
        if (key === "u") {
          event.preventDefault();
          state.setArticleFilter("unread");
          resetPrefix();
          return;
        }
        if (key === "a") {
          event.preventDefault();
          state.setArticleFilter("all");
          resetPrefix();
          return;
        }
        if (key === "s") {
          event.preventDefault();
          state.setArticleFilter("starred");
          resetPrefix();
          return;
        }
        if (key === "h") {
          event.preventDefault();
          state.selectAllFeeds();
          resetPrefix();
          return;
        }
        if (key === "f") {
          event.preventDefault();
          state.navigate({ to: "/feeds" });
          resetPrefix();
          return;
        }

        resetPrefix();
      }

      if (key === "g") {
        event.preventDefault();
        startPrefix("g");
        return;
      }

      // /: Open search
      if (event.key === "/") {
        event.preventDefault();
        state.setSearchOpen(true);
        return;
      }

      // Shift+R: check all feeds
      if (key === "r" && event.shiftKey) {
        event.preventDefault();
        state.startPull();
        return;
      }

      // r: check what the article list shows (nothing without a list or on Starred)
      if (key === "r" && !event.shiftKey) {
        const scope = usePullStore.getState().listScope;
        if (scope) {
          event.preventDefault();
          state.startPull({ pane: "list", scope });
        }
        return;
      }

      // ?: Open shortcuts help
      if (event.key === "?") {
        event.preventDefault();
        state.setShortcutsOpen(true);
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      if (pendingPrefixTimerRef.current !== null) {
        window.clearTimeout(pendingPrefixTimerRef.current);
      }
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);
}

// The article list owns paging, so j on the last loaded row tells it instead
// of fetching here.
type ArticleEndListener = (lastArticleId: number) => void;
const articleEndListeners = new Set<ArticleEndListener>();

export function onArticleNavigationEnd(listener: ArticleEndListener) {
  articleEndListeners.add(listener);
  return () => {
    articleEndListeners.delete(listener);
  };
}

// j with the open article missing from the loaded rows (the list reset to its
// first page): a listener returning true takes over, else j selects the first row.
type ArticleMissingListener = (openArticleId: number) => boolean;
const articleMissingListeners = new Set<ArticleMissingListener>();

export function onOpenArticleMissing(listener: ArticleMissingListener) {
  articleMissingListeners.add(listener);
  return () => {
    articleMissingListeners.delete(listener);
  };
}

// A held j/k opens the article of its first press only. Repeats move the list
// highlight (a store, not the URL) so no article body is rendered per row
// passed; the row the highlight is on when the key comes up (or repeats stop
// for HOLD_IDLE_MS, in case the keyup is lost) opens then. The rows passed are
// handed to the list in one go, which marks them read when "open" is on.
// Module state: the list's and the drawer's navigation instances take turns
// handling one hold, since the first press opens an article and flips which of
// them is enabled.
const HOLD_IDLE_MS = 150;
const SETTLE_TIMEOUT_MS = 1000;

type PassedListener = (ids: number[]) => void;
const passedListeners = new Set<PassedListener>();

// Holds only run while a list listens: it draws the highlight and marks the rows.
export function onArticlesPassed(listener: PassedListener) {
  passedListeners.add(listener);
  return () => {
    passedListeners.delete(listener);
  };
}

interface NavigationState {
  articleIds: number[];
  selectedArticleId: number | null;
  setSelectedArticle: (articleId: number | null) => void;
}

let heldKey: string | null = null;
// What the press of heldKey asked the URL to open; the URL may not show it yet.
let heldOpen: { from: number | null; to: number } | null = null;
// When the held key last repeated: a page that lands while repeats still arrive
// belongs to the hold, one that lands after a tap does not.
let lastRepeatAt = 0;
let moving = false;
let passed: number[] = [];
let holdState: { current: NavigationState } | null = null;
let idleTimer: number | null = null;
// Highlight handed to the URL: kept until the URL shows it, so the row does not
// flash back to the previous article.
let settling: number | null = null;
let settleTimer: number | null = null;

function highlightedId() {
  return useNavHighlightStore.getState().id;
}

function openedId(state: NavigationState) {
  return heldOpen !== null && state.selectedArticleId === heldOpen.from
    ? heldOpen.to
    : state.selectedArticleId;
}

function clearIdleTimer() {
  if (idleTimer !== null) {
    window.clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function cancelSettle() {
  if (settleTimer !== null) {
    window.clearTimeout(settleTimer);
    settleTimer = null;
  }
  settling = null;
}

function clearHighlight() {
  cancelSettle();
  useNavHighlightStore.setState({ id: null });
}

function handOverHighlight(id: number) {
  cancelSettle();
  settling = id;
  useNavHighlightStore.setState({ id });
  settleTimer = window.setTimeout(clearHighlight, SETTLE_TIMEOUT_MS);
}

function settleHighlight(urlArticleId: number | null) {
  if (settling !== null && urlArticleId === settling) clearHighlight();
}

function moveHighlight(id: number, state: { current: NavigationState }) {
  if (!moving) {
    moving = true;
    passed = [];
  }
  holdState = state;
  passed.push(id);
  cancelSettle();
  useNavHighlightStore.setState({ id });
  armIdleTimer();
}

function armIdleTimer() {
  clearIdleTimer();
  idleTimer = window.setTimeout(releaseHold, HOLD_IDLE_MS);
}

function emitPassed(ids: number[], skip: Array<number | null>) {
  const rows = [...new Set(ids)].filter((id) => !skip.includes(id));
  if (rows.length > 0) passedListeners.forEach((l) => l(rows));
}

function dropHold() {
  clearIdleTimer();
  moving = false;
  passed = [];
  clearHighlight();
}

function releaseHold() {
  clearIdleTimer();
  if (!moving || holdState === null) return;
  const state = holdState.current;
  const target = highlightedId();
  moving = false;
  const rows = passed;
  passed = [];
  if (target === null) return;
  const open = openedId(state);
  emitPassed(rows, [target, open]);
  if (target === open) {
    clearHighlight();
    return;
  }
  handOverHighlight(target);
  state.setSelectedArticle(target);
}

function handleStepKeyUp(event: KeyboardEvent) {
  if (event.key.toLowerCase() !== heldKey) return;
  releaseHold();
  heldKey = null;
  heldOpen = null;
}

function stepDirection(event: KeyboardEvent): 1 | -1 | null {
  const key = event.key.toLowerCase();
  if (key === "j" || key === "n" || event.key === "ArrowDown") return 1;
  if (key === "k" || key === "p" || event.key === "ArrowUp") return -1;
  return null;
}

// For the list's own steps (a page that landed under a held j): they move the
// highlight while a key is down, and the URL otherwise.
export function stepSelectedArticle(
  id: number,
  setSelectedArticle: (articleId: number) => void,
) {
  const repeating =
    heldKey !== null && Date.now() - lastRepeatAt < HOLD_IDLE_MS;
  if ((moving || repeating) && holdState !== null) {
    moveHighlight(id, holdState);
  } else setSelectedArticle(id);
}

function stepFromKey(
  stateRef: { current: NavigationState },
  direction: 1 | -1,
  event: KeyboardEvent,
) {
  const state = stateRef.current;
  const ids = state.articleIds;
  const key = event.key.toLowerCase();
  holdState = stateRef;

  if (event.repeat && heldKey === key && passedListeners.size > 0) {
    lastRepeatAt = Date.now();
    if (moving) armIdleTimer();
    const base = moving ? highlightedId() : openedId(state);
    const index = base === null ? -1 : ids.indexOf(base);
    if (index === -1) {
      if (moving) dropHold();
      return;
    }
    const next = ids[index + direction];
    if (next !== undefined) moveHighlight(next, stateRef);
    else if (direction === 1) articleEndListeners.forEach((l) => l(ids[index]));
    return;
  }

  // A fresh press (or a repeat nobody started): opens at once, like a single tap.
  const wasMoving = moving;
  const base = wasMoving ? highlightedId() : state.selectedArticleId;
  const index = base === null ? -1 : ids.indexOf(base);
  if (
    !wasMoving &&
    direction === 1 &&
    base !== null &&
    index === -1 &&
    [...articleMissingListeners].some((l) => l(base))
  ) {
    return;
  }
  const target =
    direction === 1
      ? index < ids.length - 1
        ? ids[index + 1]
        : undefined
      : index > 0
        ? ids[index - 1]
        : undefined;
  if (target === undefined) {
    if (direction === 1 && index >= 0) {
      articleEndListeners.forEach((l) => l(ids[index]));
    }
    if (!wasMoving) {
      heldKey = key;
      heldOpen = null;
    }
    return;
  }

  if (wasMoving) {
    // Another key took over mid-hold: the highlight is passed too.
    clearIdleTimer();
    moving = false;
    const rows = passed;
    passed = [];
    emitPassed(rows, [heldOpen?.to ?? null]);
  }
  heldKey = key;
  heldOpen = { from: state.selectedArticleId, to: target };
  if (wasMoving || settling !== null) handOverHighlight(target);
  state.setSelectedArticle(target);
}

export function useArticleNavigation(
  articleIds: number[],
  options: ArticleNavigationOptions = {},
) {
  const { selectedArticleId, setSelectedArticle } = useUrlState();
  const isSearchOpen = useUIStore((s) => s.isSearchOpen);
  const isSettingsOpen = useUIStore((s) => s.isSettingsOpen);
  const isShortcutsOpen = useUIStore((s) => s.isShortcutsOpen);
  const {
    enabled = true,
    onToggleRead,
    onToggleStar,
    onOpenOriginal,
    onToggleFullText,
    onToggleWebPage,
  } = options;
  const latestStateRef = useRef({
    articleIds,
    enabled,
    selectedArticleId,
    isSearchOpen,
    isSettingsOpen,
    isShortcutsOpen,
    onToggleRead,
    onToggleStar,
    onOpenOriginal,
    onToggleFullText,
    onToggleWebPage,
    setSelectedArticle,
  });

  useEffect(() => {
    latestStateRef.current = {
      articleIds,
      enabled,
      selectedArticleId,
      isSearchOpen,
      isSettingsOpen,
      isShortcutsOpen,
      onToggleRead,
      onToggleStar,
      onOpenOriginal,
      onToggleFullText,
      onToggleWebPage,
      setSelectedArticle,
    };
  }, [
    articleIds,
    enabled,
    selectedArticleId,
    isSearchOpen,
    isSettingsOpen,
    isShortcutsOpen,
    onToggleRead,
    onToggleStar,
    onOpenOriginal,
    onToggleFullText,
    onToggleWebPage,
    setSelectedArticle,
  ]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const state = latestStateRef.current;

      if (!state.enabled) {
        return;
      }

      if (event.defaultPrevented) {
        return;
      }

      // Don't handle navigation keys while typing in form fields
      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      // Shift+W: toggle the web page view
      if (
        event.shiftKey &&
        event.key.toLowerCase() === "w" &&
        state.selectedArticleId !== null &&
        state.onToggleWebPage
      ) {
        if (
          state.isSearchOpen ||
          state.isSettingsOpen ||
          state.isShortcutsOpen ||
          isLayerOpen()
        ) {
          return;
        }
        event.preventDefault();
        state.onToggleWebPage();
        return;
      }

      // Shift chords are reserved for sidebar tree navigation.
      if (event.shiftKey) {
        return;
      }

      if (
        state.isSearchOpen ||
        state.isSettingsOpen ||
        state.isShortcutsOpen ||
        isLayerOpen()
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      // J/N/ArrowDown: next article. K/P/ArrowUp: previous article.
      const direction = stepDirection(event);
      if (direction !== null) {
        event.preventDefault();
        stepFromKey(latestStateRef, direction, event);
        return;
      }

      if (state.selectedArticleId === null) {
        return;
      }

      // M: toggle read/unread
      if (key === "m" && state.onToggleRead) {
        event.preventDefault();
        void state.onToggleRead();
        return;
      }

      // S/F: toggle star
      if ((key === "s" || key === "f") && state.onToggleStar) {
        event.preventDefault();
        void state.onToggleStar();
        return;
      }

      // O/V: open original article
      if ((key === "o" || key === "v") && state.onOpenOriginal) {
        event.preventDefault();
        state.onOpenOriginal();
        return;
      }

      // W: toggle full article text
      if (key === "w" && state.onToggleFullText) {
        event.preventDefault();
        state.onToggleFullText();
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleStepKeyUp);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleStepKeyUp);
    };
  }, []);

  useEffect(() => {
    settleHighlight(selectedArticleId);
  }, [selectedArticleId]);

  const goToNext = () => {
    const currentIndex = selectedArticleId
      ? articleIds.indexOf(selectedArticleId)
      : -1;
    if (currentIndex < articleIds.length - 1) {
      setSelectedArticle(articleIds[currentIndex + 1]);
    }
  };

  const goToPrevious = () => {
    const currentIndex = selectedArticleId
      ? articleIds.indexOf(selectedArticleId)
      : -1;
    if (currentIndex > 0) {
      setSelectedArticle(articleIds[currentIndex - 1]);
    }
  };

  const hasNext = () => {
    const currentIndex = selectedArticleId
      ? articleIds.indexOf(selectedArticleId)
      : -1;
    return currentIndex < articleIds.length - 1;
  };

  const hasPrevious = () => {
    const currentIndex = selectedArticleId
      ? articleIds.indexOf(selectedArticleId)
      : -1;
    return currentIndex > 0;
  };

  return { goToNext, goToPrevious, hasNext, hasPrevious };
}
