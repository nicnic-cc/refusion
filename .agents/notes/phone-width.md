# Phone width (fork)

Why the app looks and behaves the way it does below 768 px. Decided
2026-10-14.

## Rules

- "Phone" is `< 768 px`, the `useIsMobile` breakpoint
  (`frontend/src/hooks/use-mobile.ts`). Every phone-only change sits
  behind `max-md:` / `max-sm:` or `@media (max-width: 767px)`, so desktop
  renders the same classes as upstream.
- Phone overrides that CSS selectors can reach go in
  `frontend/src/fork-mobile.css` (unlayered, so it beats Tailwind
  utilities without `!important`); upstream TSX only gets `max-md:`
  class additions. Keeps upstream merges small.
- Tap targets are 44 px (Apple HIG). The element that takes the tap must
  be 44 px itself: padding on a sidebar row `div` does not enlarge the
  buttons inside it.
- Text fields are 16 px on phones: iOS Safari zooms the page when a
  field under 16 px gets focus.
- The app shell is `h-dvh`, not `h-screen`: with inner scrolling Safari's
  toolbar never collapses, so `100vh` put the end of the list behind it.
- Phones narrower than 360 px are not supported. The drawer header
  (logo, three filter tabs, Search, More at 44 px) needs about 318 px and
  overlaps in the 272 px drawer of a 320 px phone.

## Not done

- Article footer with read and star next to prev/next: built and
  rejected. The footer keeps prev/next only; the
  header's read and star are 40 px instead (32 px under 360 px, where
  40 px pushes the close button off screen).
- Still under 44 px: article list-row buttons, menu and select options,
  the Manage Feeds toolbar and global filter button. The small filter
  switches stay 24x14 to the eye; an `::after` makes their tap area 44 px.
- Swipe to close the article and edge swipe for the sidebar: only worth
  it in the PWA (Safari owns the left edge for back), via Base UI's
  `Drawer`.
- Pull down to close an article: rejected. It fights scrolling the
  article (every read starts with a downward drag) and Safari's bounce;
  Safari's back swipe already closes it.

To re-measure, the git-ignored audit script
`.research/mobile-audit/audit.mjs` emulates iPhone sizes and lists every
target under 44 px and every field under 16 px.
