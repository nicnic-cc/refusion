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
- Phone headers (`ContentHeader`) have 6 px side padding, the same as
  above and below their 44 px buttons; they need not line up with the
  list text because only one header shows at a time.
  `sm:max-md:px-1.5` is needed because `sm:px-6` comes later in the CSS.
  The Navigation icon is 20 px against 16 px for the other header icons
  on purpose: it is the main button.
- Safe-area insets (installed PWA, `viewport-fit=cover`) are global, not
  phone-only: iPads have them too, and `env()` is 0 in desktop browsers.
  Fixed 56 px headers carry `fork-safe-top` and grow by the inset
  instead of squashing. Playwright can fake insets with CDP
  `Emulation.setSafeAreaInsetsOverride`.
- In the installed iOS app the status-bar strip takes the body colour,
  even over a fixed sheet, so an open sheet switches the body to
  `--popover` (`display-mode: standalone` only).
- The installed iOS app sometimes starts with `innerHeight`, `dvh`,
  `100%` and `inset: 0` 62 px short (screen minus status bar) and never
  corrects; `vh` stays right. So in standalone mode the shell and the
  sheets use `100vh` (no Safari toolbar there for `dvh` to track).
- Phones narrower than 360 px are not supported. The drawer header
  (logo, three filter tabs, Search, More at 44 px) needs about 318 px and
  overlaps in the 272 px drawer of a 320 px phone.

## Not done

- Article footer with read and star next to prev/next: built and
  rejected. The footer keeps prev/next only; the
  header's read and star are 40 px instead (32 px under 360 px, where
  40 px pushes the close button off screen).
- Hiding the article footer in landscape: not done. iPhones in landscape
  are >= 768 px, so the footer isn't rendered there; on smaller phones in
  landscape it holds the only prev/next.
- No bottom inset on the phone sidebar sheet: padding would show a
  `bg-popover` strip under `bg-sidebar`. Dialogs are not inset (centred).
- Still under 44 px: the article list-row mark-read dot is 36 px so
  rows don't grow; star and open-in-browser there are hover-only, so
  touch phones drop them from the row (iPad keeps them). Switches keep
  their look (24x14, 32x18); an `::after` makes their tap area 44 px.
  The filter dialog's checkbox stays 16 px; its 44 px label takes the tap.
- Swipe to close the article and edge swipe for the sidebar: only worth
  it in the PWA (Safari owns the left edge for back), via Base UI's
  `Drawer`.
- Pull down to close an article: rejected. It fights scrolling the
  article (every read starts with a downward drag) and Safari's bounce;
  Safari's back swipe already closes it.

To re-measure, the git-ignored audit script
`.research/mobile-audit/audit.mjs` emulates iPhone sizes and lists every
target under 44 px and every field under 16 px.
