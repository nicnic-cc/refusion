import type { ReactElement, ReactNode } from "react";
import { SharedTooltipTrigger } from "@/components/common/shared-tooltip";

// Styled tooltip around an existing control, so its own markup and classes
// stay untouched (TooltipButton would restyle it as a Button).
export function WithTooltip({
  label,
  render,
  children,
  side,
}: {
  label: ReactNode;
  render: ReactElement;
  children?: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <SharedTooltipTrigger tip={label} side={side} render={render}>
      {children}
    </SharedTooltipTrigger>
  );
}
