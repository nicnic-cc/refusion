const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
]);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideo(
  link: string,
): { id: string; vertical: boolean } | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  let id: string | null = null;
  let vertical = false;
  if (url.hostname === "youtu.be") {
    id = url.pathname.slice(1);
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    if (url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else if (url.pathname.startsWith("/shorts/")) {
      id = url.pathname.slice("/shorts/".length);
      vertical = true;
    }
  }
  return id !== null && VIDEO_ID.test(id) ? { id, vertical } : null;
}
