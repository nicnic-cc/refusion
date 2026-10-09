import { cn } from "@/lib/utils";

export function YoutubeEmbed({
  id,
  vertical,
  title,
}: {
  id: string;
  vertical: boolean;
  title: string;
}) {
  return (
    <iframe
      src={`https://www.youtube-nocookie.com/embed/${id}`}
      title={title}
      loading="lazy"
      allowFullScreen
      allow="encrypted-media; picture-in-picture; fullscreen"
      // The app sends no-referrer, and YouTube refuses to play without one.
      referrerPolicy="strict-origin-when-cross-origin"
      className={cn(
        "block rounded-lg border-0",
        vertical
          ? "mx-auto aspect-9/16 w-full max-w-90"
          : "aspect-video w-full",
      )}
    />
  );
}
