import { usePreferencesStore } from "@/store";
import { usePanesFit } from "./use-panes-fit";

export function useReadingPane() {
  const readingLayout = usePreferencesStore((s) => s.readingLayout);
  const panesFit = usePanesFit();
  return readingLayout === "panes" && panesFit;
}
