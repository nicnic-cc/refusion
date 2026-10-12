import type { Item } from "@/lib/api";

// The page "open original" goes to: the item's own page when its feed opts in
// and the item has one, else the main link. Bookmarks keep keying on article.link.
export function articleOpenLink(
  article: Pick<Item, "link" | "permalink">,
  openPermalink: boolean,
): string {
  return openPermalink && article.permalink ? article.permalink : article.link;
}
