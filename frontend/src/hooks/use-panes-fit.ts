import * as React from "react";

// Below this the article pane gets too narrow beside the sidebar and list,
// so the panes layout falls back to the drawer.
const PANES_MIN_WIDTH = 1280;
const QUERY = `(min-width: ${PANES_MIN_WIDTH}px)`;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function usePanesFit() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
