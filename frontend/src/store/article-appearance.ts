import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// Per device and never synced: how the open article is typeset.
export const articleFontOptions = ["sans", "serif", "mono"] as const;
export type ArticleFont = (typeof articleFontOptions)[number];

// Integer percent, so repeated steps never drift the way 0.1 floats would.
export const articleScaleMin = 80;
export const articleScaleMax = 160;
export const articleScaleStep = 10;

const defaultFont: ArticleFont = "sans";
const defaultScale = 100;

function normalizeFont(value: unknown): ArticleFont {
  return articleFontOptions.includes(value as ArticleFont)
    ? (value as ArticleFont)
    : defaultFont;
}

function normalizeScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultScale;
  }
  const stepped = Math.round(value / articleScaleStep) * articleScaleStep;
  return Math.min(articleScaleMax, Math.max(articleScaleMin, stepped));
}

interface ArticleAppearanceState {
  font: ArticleFont;
  scale: number;
  setFont: (font: string) => void;
  setScale: (scale: number) => void;
}

export const useArticleAppearanceStore = create<ArticleAppearanceState>()(
  persist(
    (set) => ({
      font: defaultFont,
      scale: defaultScale,
      setFont: (font) => set({ font: normalizeFont(font) }),
      setScale: (scale) => set({ scale: normalizeScale(scale) }),
    }),
    {
      name: "refusion-article-appearance",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ font: state.font, scale: state.scale }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as
          | Partial<ArticleAppearanceState>
          | undefined;

        return {
          ...currentState,
          font: normalizeFont(persisted?.font),
          scale: normalizeScale(persisted?.scale),
        };
      },
    },
  ),
);
