import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// Native scrolling; data-slot keeps the pull-to-refresh/sidebar selectors and tests working.
export function ScrollBox({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="scroll-area-viewport"
      className={cn(
        "overflow-x-hidden overflow-y-auto [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]",
        className,
      )}
      {...props}
    />
  );
}
