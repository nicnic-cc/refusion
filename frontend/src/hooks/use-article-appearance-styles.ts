import type { CSSProperties } from "react";
import {
  useArticleAppearanceStore,
  type ArticleFont,
} from "@/store/article-appearance";

const serifStack =
  'Georgia, Cambria, "Times New Roman", Times, "Noto Serif CJK SC", "Songti SC", serif';

// Sans is the stylesheet default, so it gets no override at all.
export const articleFontFamilies: Record<ArticleFont, string | undefined> = {
  sans: undefined,
  serif: serifStack,
  mono: "var(--font-geist-mono)",
};

// Inline styles for the title and the typeset body of the open article.
export function useArticleAppearanceStyles(): {
  title: CSSProperties;
  body: CSSProperties;
} {
  const font = useArticleAppearanceStore((s) => s.font);
  const scale = useArticleAppearanceStore((s) => s.scale);
  const family = articleFontFamilies[font];

  return {
    title: { fontFamily: family },
    body: {
      "--article-scale": scale / 100,
      ...(family && {
        "--typeset-font-body": family,
        "--typeset-font-heading": family,
      }),
    } as CSSProperties,
  };
}
