import { useFeedWebCSS } from "@/queries/feed-web-css";

// The key carries the feed CSS version, so saving or deleting the CSS reloads
// the page; the server injects the CSS, so the URL itself does not change.
export function WebPageFrame({
  articleId,
  feedId,
  src,
  title,
}: {
  articleId: number;
  feedId: number;
  src: string;
  title: string;
}) {
  const css = useFeedWebCSS(feedId);
  return (
    <iframe
      key={`${articleId}:${css?.updated_at ?? 0}`}
      src={src}
      title={title}
      className="min-h-0 w-full flex-1 border-0 bg-white"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
      referrerPolicy="no-referrer"
    />
  );
}
