// Label for a Cmd/Ctrl shortcut, matching the key the user actually presses.
export function modKey(key: string): string {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const k = key.toUpperCase();
  return isMac ? `⌘${k}` : `Ctrl+${k}`;
}
