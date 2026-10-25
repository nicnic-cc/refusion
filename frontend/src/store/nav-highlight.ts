import { create } from "zustand";

// The list row a held j/k stands on while the URL still shows the article the
// first press opened. Null when no hold is in progress.
export const useNavHighlightStore = create<{ id: number | null }>(() => ({
  id: null,
}));
